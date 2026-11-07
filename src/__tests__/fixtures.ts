import { vi } from 'vitest'
import type {
	CompanionActionCallbackContext,
	CompanionActionDefinitions,
	CompanionActionEvent,
	CompanionActionInfo,
	CompanionActionLearnContext,
	CompanionFeedbackCallbackContext,
	CompanionFeedbackDefinitions,
	CompanionFeedbackInfo,
	CompanionFeedbackLearnContext,
	CompanionVariableDefinitions,
	CompanionVariableValues,
} from '@companion-module/base'
import DuganInstance from '../main.js'
import type { ActionSchema } from '../actions.js'
import type { FeedbackSchema } from '../feedbacks.js'
import type { VariablesSchema } from '../variables.js'
import type { ModuleConfig } from '../config.js'
import { DeviceState } from '../state.js'
import type { Command, CommandSource } from '../api/index.js'

/*
 * There is no capture from a unit to work from. The binary blocks below are laid out from the offsets the 1.x module
 * read, which it used against Model M and N units: they encode what that module believed, not what a unit was seen to
 * send.
 */

/** A GS block, with no flags set and every meter at its floor, -127.5 dB, unless given */
export function meterStatusBlock(
	fill: {
		presence?: number[]
		clip?: number[]
		automixGain?: Record<number, number>
		inputPeak?: Record<number, number>
		outputPeak?: Record<number, number>
		nomPeak?: Record<number, number>
		musicPeak?: Record<number, number>
		matrixPeak?: Record<number, number>
	} = {},
): Buffer {
	const data = Buffer.alloc(235, 0)
	data.write('*GS,', 0, 'latin1')
	for (const [offset, count] of [
		[21, 64],
		[85, 3],
		[91, 64],
		[155, 64],
		[221, 3],
		[227, 6],
	]) {
		data.fill(255, offset, offset + count)
	}
	const flags = (offset: number, channels: number[] = []) => {
		for (const channel of channels) data[offset + Math.floor((channel - 1) / 8)] |= 1 << ((channel - 1) % 8)
	}
	const levels = (offset: number, values: Record<number, number> = {}) => {
		for (const [index, byte] of Object.entries(values)) data[offset + Number(index) - 1] = byte
	}
	flags(4, fill.presence)
	flags(12, fill.clip)
	levels(21, fill.automixGain)
	levels(85, fill.nomPeak)
	levels(91, fill.inputPeak)
	levels(155, fill.outputPeak)
	levels(221, fill.musicPeak)
	levels(227, fill.matrixPeak)
	data.write('\r\n', 233, 'latin1')
	return data
}

/** A GP block */
export function channelBulkBlock(
	fill: {
		modes?: Record<number, number>
		channelCount?: number
		bypass?: number[]
		nom?: number[]
		music?: number[]
		override?: number[]
		groups?: Record<number, number>
		presets?: Record<number, number>
	} = {},
): Buffer {
	const data = Buffer.alloc(438, 0)
	data.write('*GP,', 0, 'latin1')
	for (const [channel, mode] of Object.entries(fill.modes ?? {})) data[4 + Number(channel) - 1] = mode
	data[68] = fill.channelCount ?? 64
	const flags = (offset: number, channels: number[] = []) => {
		for (const channel of channels) data[offset + Math.floor((channel - 1) / 8)] |= 1 << ((channel - 1) % 8)
	}
	const pairs = (offset: number, values: Record<number, number> = {}) => {
		for (const [channel, value] of Object.entries(values)) {
			const index = Number(channel) - 1
			data[offset + Math.floor(index / 4)] |= (value & 0b11) << ((index % 4) * 2)
		}
	}
	flags(69, fill.bypass)
	flags(77, fill.nom)
	flags(85, fill.music)
	flags(93, fill.override)
	pairs(101, fill.groups)
	pairs(117, fill.presets)
	return data
}

/** A GM block, with every crosspoint off and every gain at 0 dB unless given, as raw bytes */
export function matrixBulkBlock(
	fill: { crosspoints?: Record<string, number>; gains?: Record<number, number> } = {},
): Buffer {
	const data = Buffer.alloc(886, 0)
	data.write('*GM,', 0, 'latin1')
	data.fill(192, 880, 886)
	for (const [key, byte] of Object.entries(fill.crosspoints ?? {})) {
		const [matrix, input] = key.split(':').map(Number)
		data[4 + (matrix - 1) * 144 + input - 1] = byte
	}
	for (const [matrix, byte] of Object.entries(fill.gains ?? {})) data[880 + Number(matrix) - 1] = byte
	return data
}

export function config(overrides: Partial<ModuleConfig> = {}): ModuleConfig {
	return {
		host: '127.0.0.1',
		port: 23,
		keepAlive: 0,
		meterRate: 0,
		model: 12,
		channels: 1,
		rate: 0,
		subscription: 1,
		isTalkingThreshold: -3,
		...overrides,
	}
}

function createMocks() {
	return {
		sendCommand: vi.fn<(source: CommandSource, signal?: AbortSignal) => Promise<void>>(async () => {}),
		sendBackground: vi.fn<(source: CommandSource) => void>(),
		request: vi.fn<(query: Command) => void>(),
		requireSubscription: vi.fn<() => void>(),
		recordAction: vi.fn<DuganInstance['recordAction']>(),
		setActionDefinitions: vi.fn<(defs: CompanionActionDefinitions<ActionSchema>) => void>(),
		setFeedbackDefinitions: vi.fn<(defs: CompanionFeedbackDefinitions<FeedbackSchema>) => void>(),
		setVariableDefinitions: vi.fn<(defs: CompanionVariableDefinitions<VariablesSchema>) => void>(),
		setVariableValues: vi.fn<(values: CompanionVariableValues) => void>(),
		checkFeedbacks: vi.fn<(...ids: string[]) => void>(),
		updateActions: vi.fn<() => void>(),
		updateFeedbacks: vi.fn<() => void>(),
		updateDefinitions: vi.fn<() => void>(),
		log: vi.fn<DuganInstance['log']>(),
	}
}

export type FakeInstance = { self: DuganInstance } & ReturnType<typeof createMocks>

/**
 * A plain object standing in for the instance. The state, and the model and channel count worked out from it and the
 * config, are the real ones; everything that would reach Companion or the unit is a mock.
 */
export function fakeInstance(overrides: Partial<ModuleConfig> = {}): FakeInstance {
	const mocks = createMocks()
	const self = {
		config: config(overrides),
		state: new DeviceState(),
		isRecordingActions: false,
		...mocks,
	} as unknown as DuganInstance
	for (const getter of ['model', 'channelCount', 'definitionContext'] as const) {
		const descriptor = Object.getOwnPropertyDescriptor(DuganInstance.prototype, getter)
		Object.defineProperty(self, getter, { get: descriptor?.get?.bind(self) })
	}
	return { self, ...mocks }
}

/** The text of each command sent, building any that are built when their turn comes */
export function sentTexts(mock: FakeInstance['sendCommand'] | FakeInstance['sendBackground']): (string | undefined)[] {
	return mock.mock.calls.map(([source]) => (typeof source === 'function' ? source() : source)?.text)
}

type AnyActionCallback = (action: CompanionActionEvent, context: CompanionActionCallbackContext) => Promise<void>
type AnyActionLearn = (action: CompanionActionEvent, context: CompanionActionLearnContext) => unknown
type AnyActionSubscribe = (action: CompanionActionInfo, context: unknown) => void

function actionEvent(actionId: string, options: CompanionActionEvent['options']): CompanionActionEvent {
	return { id: `action-${actionId}`, controlId: 'bank-1', actionId, surfaceId: undefined, options }
}

/** The definitions the instance last set */
export function actionDefinitions(fake: FakeInstance): CompanionActionDefinitions<ActionSchema> {
	const calls = fake.setActionDefinitions.mock.calls
	const defs = calls.at(-1)?.[0]
	if (!defs) throw new Error('No action definitions set')
	return defs
}

export function feedbackDefinitions(fake: FakeInstance): CompanionFeedbackDefinitions<FeedbackSchema> {
	const defs = fake.setFeedbackDefinitions.mock.calls.at(-1)?.[0]
	if (!defs) throw new Error('No feedback definitions set')
	return defs
}

/** Runs one action's callback, as Companion would with the option values already resolved */
export async function runAction(
	defs: CompanionActionDefinitions<ActionSchema>,
	actionId: string,
	options: CompanionActionEvent['options'],
	signal = new AbortController().signal,
): Promise<void> {
	const def = (defs as Record<string, { callback: unknown } | undefined>)[actionId]
	if (!def) throw new Error(`${actionId} is not defined`)
	await (def.callback as AnyActionCallback)(actionEvent(actionId, options), {
		type: 'action',
		signal,
	} as CompanionActionCallbackContext)
}

export async function learnAction(
	defs: CompanionActionDefinitions<ActionSchema>,
	actionId: string,
	options: CompanionActionEvent['options'],
): Promise<unknown> {
	const def = (defs as Record<string, { learn?: unknown } | undefined>)[actionId]
	if (!def?.learn) throw new Error(`${actionId} has no learn`)
	return await (def.learn as AnyActionLearn)(actionEvent(actionId, options), {
		type: 'action',
		signal: new AbortController().signal,
	})
}

export function subscribeAction(
	defs: CompanionActionDefinitions<ActionSchema>,
	actionId: string,
	options: CompanionActionEvent['options'],
): void {
	const def = (defs as Record<string, { subscribe?: unknown } | undefined>)[actionId]
	if (!def?.subscribe) throw new Error(`${actionId} has no subscribe`)
	;(def.subscribe as AnyActionSubscribe)(actionEvent(actionId, options), {})
}

type AnyFeedbackCallback = (feedback: CompanionFeedbackInfo, context: CompanionFeedbackCallbackContext) => unknown
type AnyFeedbackLearn = (feedback: CompanionFeedbackInfo, context: CompanionFeedbackLearnContext) => unknown

function feedbackInfo(feedbackId: string, options: CompanionFeedbackInfo['options']): CompanionFeedbackInfo {
	return {
		type: 'boolean',
		id: `feedback-${feedbackId}`,
		controlId: 'bank-1',
		feedbackId,
		options,
		previousOptions: null,
	}
}

export async function learnFeedback(
	defs: CompanionFeedbackDefinitions<FeedbackSchema>,
	feedbackId: string,
	options: CompanionFeedbackInfo['options'],
): Promise<unknown> {
	const def = (defs as Record<string, { learn?: unknown } | undefined>)[feedbackId]
	if (!def?.learn) throw new Error(`${feedbackId} has no learn`)
	return await (def.learn as AnyFeedbackLearn)(feedbackInfo(feedbackId, options), {
		type: 'feedback',
		signal: new AbortController().signal,
	} as unknown as CompanionFeedbackLearnContext)
}

/** Runs one feedback's callback */
export function checkFeedback(
	defs: CompanionFeedbackDefinitions<FeedbackSchema>,
	feedbackId: string,
	options: CompanionFeedbackInfo['options'],
): unknown {
	const def = (defs as Record<string, { callback: unknown } | undefined>)[feedbackId]
	if (!def) throw new Error(`${feedbackId} is not defined`)
	return (def.callback as AnyFeedbackCallback)(feedbackInfo(feedbackId, options), {
		type: 'feedback',
		signal: new AbortController().signal,
	} as unknown as CompanionFeedbackCallbackContext)
}
