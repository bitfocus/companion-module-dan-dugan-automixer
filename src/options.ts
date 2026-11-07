import type {
	CompanionInputFieldCheckbox,
	CompanionInputFieldDropdown,
	CompanionInputFieldNumber,
	DropdownChoice,
} from '@companion-module/base'
import { GROUP_BITS, MAX_CHANNELS, MATRICES, MODEL_M, type GroupNumber } from './api/index.js'
import { ChannelMode } from './state.js'

/*
 * The ids below are saved on buttons, so must not change. Toggle and no change are 10 and 11 to stay clear of the
 * values the unit takes, as they always have been.
 */
export const TOGGLE = 10
export const NO_CHANGE = 11

export type OffOn = 0 | 1
export type OffOnToggle = OffOn | typeof TOGGLE

/** What the definitions are built from: the unit's channel count, and its model, which names its inputs */
export interface DefinitionContext {
	channelCount: number
	model: number
}

/** The Model M has MADI inputs and outputs, the others Dante */
export function ioName(model: number): string {
	return model === MODEL_M ? 'MADI' : 'Dante'
}

export const CHANNEL_MODE_CHOICES = [
	{ id: ChannelMode.Manual, label: 'Manual' },
	{ id: ChannelMode.Auto, label: 'Auto' },
	{ id: ChannelMode.Mute, label: 'Mute' },
] as const satisfies DropdownChoice<ChannelMode>[]

export const BYPASS_CHOICES = [
	{ id: 0, label: 'Normal' },
	{ id: 1, label: 'Bypass' },
	{ id: TOGGLE, label: 'Toggle' },
] as const satisfies DropdownChoice<OffOnToggle>[]

export const OVERRIDE_CHOICES = [
	{ id: 0, label: 'Normal' },
	{ id: 1, label: 'Override' },
	{ id: TOGGLE, label: 'Toggle' },
] as const satisfies DropdownChoice<OffOnToggle>[]

export const OFF_ON_TOGGLE_CHOICES = [
	{ id: 0, label: 'Off' },
	{ id: 1, label: 'On' },
	{ id: TOGGLE, label: 'Toggle' },
] as const satisfies DropdownChoice<OffOnToggle>[]

export const MATRIX_MUTE_CHOICES = [
	{ id: 0, label: 'On' },
	{ id: 1, label: 'Mute' },
	{ id: TOGGLE, label: 'Toggle' },
] as const satisfies DropdownChoice<OffOnToggle>[]

export const POLARITY_CHOICES = [
	{ id: 0, label: 'Normal' },
	{ id: 1, label: 'Reversed' },
	{ id: TOGGLE, label: 'Toggle' },
] as const satisfies DropdownChoice<OffOnToggle>[]

export const GROUP_CHOICES = [
	{ id: 1, label: 'Group A' },
	{ id: 2, label: 'Group B' },
	{ id: 3, label: 'Group C' },
] as const satisfies DropdownChoice<GroupNumber>[]

export const GROUP_LETTERS: Readonly<Record<GroupNumber, string>> = { 1: 'A', 2: 'B', 3: 'C' }

export const MATRIX_CHOICES: DropdownChoice<number>[] = MATRICES.map((matrix) => ({
	id: matrix,
	label: `Matrix Bus ${matrix}`,
}))

/**
 * A group's setting in a group mute, preset, override or last hold action: off as 0, on as the group's bit in the
 * mask, toggle or no change. Saved buttons hold the bit, so it is the id.
 */
export type GroupFlagChoice = 0 | 1 | 2 | 4 | typeof TOGGLE | typeof NO_CHANGE

/** The choices for one group in a group flag action, labelled for the flag: Mute, Preset On and so on */
export function groupFlagChoices(group: GroupNumber, off: string, on: string): DropdownChoice<GroupFlagChoice>[] {
	return [
		{ id: 0, label: off },
		{ id: GROUP_BITS[group] as GroupFlagChoice, label: on },
		{ id: TOGGLE, label: 'Toggle' },
		{ id: NO_CHANGE, label: 'No Change' },
	]
}

function range(first: number, last: number): number[] {
	return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i)
}

export function channelChoices({ channelCount }: DefinitionContext): DropdownChoice<number>[] {
	return range(1, channelCount).map((channel) => ({ id: channel, label: `Automix Channel ${channel}` }))
}

/**
 * Matrix inputs: the automix channels from 1, then the MADI or Dante inputs from 65 and the ADAT inputs from 129,
 * however many automix channels there are
 */
export function matrixInputChoices(context: DefinitionContext): DropdownChoice<number>[] {
	const io = ioName(context.model)
	return [
		...channelChoices(context),
		...range(1, MAX_CHANNELS).map((input) => ({ id: input + MAX_CHANNELS, label: `${io} Input ${input}` })),
		...range(1, 8).map((input) => ({ id: input + MAX_CHANNELS * 2, label: `ADAT Input ${input}` })),
	]
}

/** Matrix outputs: none as 0, the MADI or Dante outputs from 1, and the ADAT outputs from 65 */
export function matrixOutputChoices({ model }: DefinitionContext): DropdownChoice<number>[] {
	const io = ioName(model)
	return [
		{ id: 0, label: 'No Output' },
		...range(1, MAX_CHANNELS).map((output) => ({ id: output, label: `${io} Output ${output}` })),
		...range(1, 8).map((output) => ({ id: output + MAX_CHANNELS, label: `ADAT Output ${output}` })),
	]
}

/** Music system inputs: 32 MADI or Dante inputs from 1, the ADAT inputs from 65, and the mix buses from 81 */
export function musicInputChoices({ model }: DefinitionContext): DropdownChoice<number>[] {
	const io = ioName(model)
	return [
		...range(1, 32).map((input) => ({ id: input, label: `${io} Input ${input}` })),
		...range(1, 8).map((input) => ({ id: input + MAX_CHANNELS, label: `ADAT Input ${input}` })),
		...range(1, 6).map((bus) => ({ id: bus + 80, label: `Mix Bus ${bus}` })),
	]
}

export function clockSourceChoices({ model }: DefinitionContext): DropdownChoice<number>[] {
	return [
		{ id: 0, label: model === MODEL_M ? 'Madi' : 'Dante' },
		{ id: 1, label: 'Word Clock' },
		{ id: 2, label: 'Internal' },
		{ id: 3, label: 'ADAT' },
	]
}

/** The inputs automix channel 1 can be mapped to, which leave room for the rest */
export function channelOffsetChoices(context: DefinitionContext): DropdownChoice<number>[] {
	const io = ioName(context.model)
	return range(1, MAX_CHANNELS - context.channelCount + 1).map((input) => ({
		id: input,
		label: `${io} Input ${input}`,
	}))
}

/**
 * Was a dropdown taking custom values and variables before API 2.0. Expression mode replaces that, and
 * UpgradeScripts[0] converts saved custom values.
 */
export function channelOption(context: DefinitionContext): CompanionInputFieldDropdown<'channel', number> {
	return {
		id: 'channel',
		type: 'dropdown',
		label: 'Channel',
		// Channel 1. The choices are built at runtime from the channel count, so there is no fixed entry to reference
		default: 1,
		choices: channelChoices(context),
		expressionDescription: `Should return a channel number, 1 to ${context.channelCount}`,
	}
}

/** As {@link channelOption} */
export const groupOption: CompanionInputFieldDropdown<'group', number> = {
	id: 'group',
	type: 'dropdown',
	label: 'Group',
	default: GROUP_CHOICES[0].id,
	choices: GROUP_CHOICES,
	expressionDescription: 'Should return a group number: 1 for A, 2 for B, 3 for C',
}

/** As {@link channelOption} */
export const matrixOption: CompanionInputFieldDropdown<'matrix', number> = {
	id: 'matrix',
	type: 'dropdown',
	label: 'Matrix',
	// Matrix Bus 1
	default: MATRIX_CHOICES[0].id,
	choices: MATRIX_CHOICES,
	expressionDescription: 'Should return a matrix number, 1 to 6',
}

export const queryOption: CompanionInputFieldCheckbox<'query'> = {
	id: 'query',
	type: 'checkbox',
	label: 'Query',
	default: false,
}

/** Ask for the current value, rather than set one */
export function queryOptionFor(what: string): CompanionInputFieldCheckbox<'query'> {
	return { ...queryOption, tooltip: `Query will poll the ${what}` }
}

export type LevelRangeOptions = { lessThan: number; greaterThan: number }

/** The two bounds a level feedback is true between */
export const levelRangeOptions: [CompanionInputFieldNumber<'lessThan'>, CompanionInputFieldNumber<'greaterThan'>] = [
	{
		type: 'number',
		label: 'Less than or equal to',
		id: 'lessThan',
		default: 0,
		max: 0,
		min: -128,
		range: true,
		step: 0.1,
	},
	{
		type: 'number',
		label: 'Greater than or equal to',
		id: 'greaterThan',
		default: -12,
		max: 0,
		min: -128,
		range: true,
		step: 0.1,
	},
]

/** The value a toggle-capable choice comes to, given what the unit has now */
export function resolveToggle(choice: number, current: boolean): OffOn {
	if (choice === TOGGLE) return current ? 0 : 1
	return choice === 0 ? 0 : 1
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}
