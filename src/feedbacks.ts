import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import {
	Code,
	channelQuery,
	command,
	groupFlags,
	groupQuery,
	isChannel,
	isGroup,
	isMatrix,
	matrixQuery,
	type ChannelCode,
	type Command,
	type MatrixCode,
} from './api/index.js'
import type ModuleInstance from './main.js'
import {
	CHANNEL_MODE_CHOICES,
	GROUP_CHOICES,
	channelOption,
	groupOption,
	levelRangeOptions,
	matrixOption,
	matrixOutputChoices,
	musicInputChoices,
	type LevelRangeOptions,
} from './options.js'
import type { Change, ChannelState, GroupState, MatrixState, SceneState } from './state.js'

/** The values are the ids saved on buttons, so must never change. They predate the snake_case convention */
export enum FeedbackId {
	SceneChanged = 'sceneChanged',
	MatrixLevel = 'matrixLevel',
	MatrixMuted = 'matrixMuted',
	MatrixPolarity = 'matrixPolarity',
	ChannelMode = 'channelMode',
	ChannelPreset = 'channelPreset',
	ChannelBypass = 'channelBypass',
	ChannelOverride = 'channelOverride',
	ChannelMusic = 'channelMusic',
	ChannelNom = 'channelNOM',
	ChannelGroupAssign = 'channelGroupAssign',
	ChannelClip = 'channelClip',
	ChannelPresence = 'channelPresence',
	ChannelInputPeak = 'channelInputPeak',
	ChannelOutputPeak = 'channelOutputPeak',
	ChannelAutomixGain = 'channelAmixGain',
	GroupMute = 'groupMute',
	GroupPreset = 'groupPreset',
	GroupOverride = 'groupOverride',
	GroupLastHold = 'groupLastHold',
	GroupNomGain = 'groupNOMgain',
	GroupMusicPeak = 'groupMusicPeak',
	GroupMusicInput = 'groupMusicInput',
	MatrixOutput = 'matrixOutput',
}

type Channel = { channel: number }
type Group = { group: number }
type Matrix = { matrix: number }
type Bool<TOptions> = { type: 'boolean'; options: TOptions }

export type FeedbackSchema = {
	[FeedbackId.SceneChanged]: Bool<Record<string, never>>
	[FeedbackId.MatrixLevel]: Bool<Matrix & LevelRangeOptions>
	[FeedbackId.MatrixMuted]: Bool<Matrix>
	[FeedbackId.MatrixPolarity]: Bool<Matrix>
	[FeedbackId.ChannelMode]: Bool<Channel & { mode: number }>
	[FeedbackId.ChannelPreset]: Bool<Channel & { preset: number }>
	[FeedbackId.ChannelBypass]: Bool<Channel>
	[FeedbackId.ChannelOverride]: Bool<Channel>
	[FeedbackId.ChannelMusic]: Bool<Channel>
	[FeedbackId.ChannelNom]: Bool<Channel>
	[FeedbackId.ChannelGroupAssign]: Bool<Channel & { group: number }>
	[FeedbackId.ChannelClip]: Bool<Channel>
	[FeedbackId.ChannelPresence]: Bool<Channel>
	[FeedbackId.ChannelInputPeak]: Bool<Channel & LevelRangeOptions>
	[FeedbackId.ChannelOutputPeak]: Bool<Channel & LevelRangeOptions>
	[FeedbackId.ChannelAutomixGain]: Bool<Channel & LevelRangeOptions>
	[FeedbackId.GroupMute]: Bool<Group>
	[FeedbackId.GroupPreset]: Bool<Group>
	[FeedbackId.GroupOverride]: Bool<Group>
	[FeedbackId.GroupLastHold]: Bool<Group>
	[FeedbackId.GroupNomGain]: Bool<Group & LevelRangeOptions>
	[FeedbackId.GroupMusicPeak]: Bool<Group & LevelRangeOptions>
	[FeedbackId.GroupMusicInput]: Bool<Group & { input: number }>
	[FeedbackId.MatrixOutput]: Bool<Matrix & { output: number }>
}

/*
 * The feedbacks reading each part of the state, which are rechecked when it changes. Every field is listed, so adding
 * one is a compile error until it says which feedback it drives, if any.
 */
const CHANNEL_FEEDBACKS: Readonly<Record<keyof ChannelState, FeedbackId | undefined>> = {
	mode: FeedbackId.ChannelMode,
	preset: FeedbackId.ChannelPreset,
	bypass: FeedbackId.ChannelBypass,
	override: FeedbackId.ChannelOverride,
	weight: undefined,
	music: FeedbackId.ChannelMusic,
	nom: FeedbackId.ChannelNom,
	group: FeedbackId.ChannelGroupAssign,
	name: undefined,
	automixGain: FeedbackId.ChannelAutomixGain,
	inputPeak: FeedbackId.ChannelInputPeak,
	outputPeak: FeedbackId.ChannelOutputPeak,
	presence: FeedbackId.ChannelPresence,
	clip: FeedbackId.ChannelClip,
}

const GROUP_FEEDBACKS: Readonly<Record<keyof GroupState, FeedbackId | undefined>> = {
	mute: FeedbackId.GroupMute,
	preset: FeedbackId.GroupPreset,
	override: FeedbackId.GroupOverride,
	lastHold: FeedbackId.GroupLastHold,
	automixDepth: undefined,
	nomGainLimit: undefined,
	musicThreshold: undefined,
	musicInput: FeedbackId.GroupMusicInput,
	nomPeak: FeedbackId.GroupNomGain,
	musicPeak: FeedbackId.GroupMusicPeak,
}

const MATRIX_FEEDBACKS: Readonly<Record<Exclude<keyof MatrixState, 'crosspoints'>, FeedbackId | undefined>> = {
	mute: FeedbackId.MatrixMuted,
	polarity: FeedbackId.MatrixPolarity,
	gain: undefined,
	output: FeedbackId.MatrixOutput,
	outputPeak: FeedbackId.MatrixLevel,
}

const SCENE_FEEDBACKS: Readonly<Record<keyof SceneState, FeedbackId | undefined>> = {
	count: undefined,
	active: undefined,
	activeIndex: undefined,
	changed: FeedbackId.SceneChanged,
	names: undefined,
}

/** The feedbacks to recheck after some changes, each once */
export function feedbacksFor(changes: readonly Change[]): FeedbackId[] {
	const ids = new Set<FeedbackId | undefined>()
	for (const change of changes) {
		switch (change.kind) {
			case 'channel':
				ids.add(CHANNEL_FEEDBACKS[change.field])
				break
			case 'group':
				ids.add(GROUP_FEEDBACKS[change.field])
				break
			case 'matrix':
				ids.add(MATRIX_FEEDBACKS[change.field])
				break
			case 'scene':
				ids.add(SCENE_FEEDBACKS[change.field])
				break
			case 'crosspoint':
			case 'info':
			case 'subscription':
				break
		}
	}
	ids.delete(undefined)
	return [...ids] as FeedbackId[]
}

const RED = combineRgb(255, 0, 0)
const GREEN = combineRgb(0, 255, 0)
const YELLOW = combineRgb(255, 255, 0)
const BLACK = combineRgb(0, 0, 0)

const inRange = (value: number | undefined, { lessThan, greaterThan }: LevelRangeOptions) =>
	value !== undefined && value <= lessThan && value >= greaterThan

export function UpdateFeedbacks(self: ModuleInstance): void {
	const context = self.definitionContext
	const channel = channelOption(context)
	const style = (bgcolor: number) => ({ bgcolor, color: BLACK })

	/**
	 * What a feedback reading a channel setting needs on each check: unsolicited messages on, so it hears of changes
	 * made anywhere, and the setting asked for once on this connection
	 */
	const watchChannel = (code: ChannelCode, ch: number): Readonly<ChannelState> | undefined => {
		self.requireSubscription()
		if (!isChannel(ch) || ch > self.channelCount) return undefined
		self.request(channelQuery(code, ch))
		return self.state.channel(ch)
	}
	const watchGroup = (query: Command | undefined, group: number): Readonly<GroupState> | undefined => {
		self.requireSubscription()
		if (!isGroup(group)) return undefined
		if (query) self.request(query)
		return self.state.group(group)
	}
	const watchMatrix = (code: MatrixCode | undefined, matrix: number): Readonly<MatrixState> | undefined => {
		self.requireSubscription()
		if (!isMatrix(matrix)) return undefined
		if (code) self.request(matrixQuery(code, matrix))
		return self.state.matrix(matrix)
	}
	/** A meter, which the meter poll keeps up to date */
	const meteredChannel = (ch: number): Readonly<ChannelState> | undefined => {
		self.requireSubscription()
		return isChannel(ch) && ch <= self.channelCount ? self.state.channel(ch) : undefined
	}

	const definitions: CompanionFeedbackDefinitions<FeedbackSchema> = {
		[FeedbackId.SceneChanged]: {
			name: 'Scene, Has Changed',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [],
			callback: () => {
				self.requireSubscription()
				self.request(command(Code.SceneActive))
				return self.state.scenes.changed
			},
		},
		[FeedbackId.MatrixLevel]: {
			name: 'Matrix Output Level',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [matrixOption, ...levelRangeOptions],
			callback: ({ options }) => inRange(watchMatrix(undefined, options.matrix)?.outputPeak, options),
		},
		[FeedbackId.MatrixMuted]: {
			name: 'Matrix Output Mute',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [matrixOption],
			callback: ({ options }) => watchMatrix(Code.MatrixMute, options.matrix)?.mute ?? false,
		},
		[FeedbackId.MatrixPolarity]: {
			name: 'Matrix Output Polarity',
			type: 'boolean',
			defaultStyle: style(YELLOW),
			options: [matrixOption],
			callback: ({ options }) => watchMatrix(Code.MatrixPolarity, options.matrix)?.polarity ?? false,
		},
		[FeedbackId.ChannelMode]: {
			name: 'Channel Mode',
			type: 'boolean',
			defaultStyle: style(GREEN),
			options: [
				channel,
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: CHANNEL_MODE_CHOICES[1].id,
					choices: CHANNEL_MODE_CHOICES,
				},
			],
			callback: ({ options }) => watchChannel(Code.ChannelMode, options.channel)?.mode === options.mode,
		},
		[FeedbackId.ChannelPreset]: {
			name: 'Channel Preset',
			type: 'boolean',
			defaultStyle: style(GREEN),
			options: [
				channel,
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					default: CHANNEL_MODE_CHOICES[1].id,
					choices: CHANNEL_MODE_CHOICES,
				},
			],
			callback: ({ options }) => watchChannel(Code.ChannelPreset, options.channel)?.preset === options.preset,
		},
		[FeedbackId.ChannelBypass]: {
			name: 'Channel Bypass',
			type: 'boolean',
			defaultStyle: style(YELLOW),
			options: [channel],
			callback: ({ options }) => watchChannel(Code.ChannelBypass, options.channel)?.bypass ?? false,
		},
		[FeedbackId.ChannelOverride]: {
			name: 'Channel Override',
			type: 'boolean',
			defaultStyle: style(YELLOW),
			options: [channel],
			callback: ({ options }) => watchChannel(Code.ChannelOverride, options.channel)?.override ?? false,
		},
		[FeedbackId.ChannelMusic]: {
			name: 'Channel Music Mode',
			type: 'boolean',
			defaultStyle: style(YELLOW),
			options: [channel],
			callback: ({ options }) => watchChannel(Code.ChannelMusic, options.channel)?.music ?? false,
		},
		[FeedbackId.ChannelNom]: {
			name: 'Channel NOM Mode',
			type: 'boolean',
			defaultStyle: style(YELLOW),
			options: [channel],
			callback: ({ options }) => watchChannel(Code.ChannelNom, options.channel)?.nom ?? false,
		},
		[FeedbackId.ChannelGroupAssign]: {
			name: 'Channel Group Assignment',
			type: 'boolean',
			defaultStyle: style(YELLOW),
			options: [
				channel,
				{ type: 'dropdown', label: 'Group', id: 'group', default: GROUP_CHOICES[0].id, choices: GROUP_CHOICES },
			],
			callback: ({ options }) => watchChannel(Code.ChannelGroup, options.channel)?.group === options.group,
		},
		[FeedbackId.ChannelClip]: {
			name: 'Channel Clip',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [channel],
			callback: ({ options }) => meteredChannel(options.channel)?.clip ?? false,
		},
		[FeedbackId.ChannelPresence]: {
			name: 'Channel Signal Presence',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [channel],
			callback: ({ options }) => meteredChannel(options.channel)?.presence ?? false,
		},
		[FeedbackId.ChannelInputPeak]: {
			name: 'Channel Input Peak Meter',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [channel, ...levelRangeOptions],
			callback: ({ options }) => inRange(meteredChannel(options.channel)?.inputPeak, options),
		},
		[FeedbackId.ChannelOutputPeak]: {
			name: 'Channel Output Peak Meter',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [channel, ...levelRangeOptions],
			callback: ({ options }) => inRange(meteredChannel(options.channel)?.outputPeak, options),
		},
		[FeedbackId.ChannelAutomixGain]: {
			name: 'Channel Automix Gain Reduction',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [channel, ...levelRangeOptions],
			callback: ({ options }) => inRange(meteredChannel(options.channel)?.automixGain, options),
		},
		[FeedbackId.GroupMute]: {
			name: 'Group Mute',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [groupOption],
			callback: ({ options }) => watchGroup(groupFlags(Code.GroupMute), options.group)?.mute ?? false,
		},
		[FeedbackId.GroupPreset]: {
			name: 'Group Preset',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [groupOption],
			callback: ({ options }) => watchGroup(groupFlags(Code.GroupPreset), options.group)?.preset ?? false,
		},
		[FeedbackId.GroupOverride]: {
			name: 'Group Override',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [groupOption],
			callback: ({ options }) => watchGroup(groupFlags(Code.GroupOverride), options.group)?.override ?? false,
		},
		[FeedbackId.GroupLastHold]: {
			name: 'Group Last Hold',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [groupOption],
			callback: ({ options }) => watchGroup(groupFlags(Code.GroupLastHold), options.group)?.lastHold ?? false,
		},
		[FeedbackId.GroupNomGain]: {
			name: 'Group NOM Gain Reduction',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [groupOption, ...levelRangeOptions],
			callback: ({ options }) => inRange(watchGroup(undefined, options.group)?.nomPeak, options),
		},
		[FeedbackId.GroupMusicPeak]: {
			name: 'Group Music System Gain Reduction',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [groupOption, ...levelRangeOptions],
			callback: ({ options }) => inRange(watchGroup(undefined, options.group)?.musicPeak, options),
		},
		[FeedbackId.GroupMusicInput]: {
			name: 'Group Music System Threshold Input',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [
				groupOption,
				{
					id: 'input',
					type: 'dropdown',
					label: 'Music System Threshold Input',
					// The first input. The choices are built at runtime, so there is no fixed entry to reference
					default: 1,
					choices: musicInputChoices(context),
				},
			],
			callback: ({ options }) => {
				const query = isGroup(options.group) ? groupQuery(Code.GroupMusicInput, options.group) : undefined
				return watchGroup(query, options.group)?.musicInput === options.input
			},
			learn: ({ options }) => {
				const input = self.state.group(options.group)?.musicInput
				return input === undefined ? undefined : { input }
			},
		},
		[FeedbackId.MatrixOutput]: {
			name: 'Matrix Output Route',
			type: 'boolean',
			defaultStyle: style(RED),
			options: [
				matrixOption,
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output',
					// The first output after none. The choices are built at runtime, so there is no fixed entry to reference
					default: 1,
					choices: matrixOutputChoices(context),
				},
			],
			callback: ({ options }) => watchMatrix(Code.MatrixOutput, options.matrix)?.output === options.output,
			learn: ({ options }) => {
				const output = self.state.matrix(options.matrix)?.output
				return output === undefined ? undefined : { output }
			},
		},
	}
	self.setFeedbackDefinitions(definitions)
}
