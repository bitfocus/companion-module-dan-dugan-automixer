import type { CompanionActionDefinitions, CompanionInputFieldDropdown } from '@companion-module/base'
import {
	Code,
	GROUP_BITS,
	GROUPS,
	MAX_MUSIC_INPUT,
	groupFlags,
	groupQuery,
	groupSet,
	isGroup,
	type GroupCode,
	type GroupFlagCode,
	type GroupNumber,
} from '../api/index.js'
import type ModuleInstance from '../main.js'
import type { GroupState } from '../state.js'
import {
	GROUP_LETTERS,
	NO_CHANGE,
	TOGGLE,
	clamp,
	groupFlagChoices,
	groupOption,
	musicInputChoices,
	queryOptionFor,
	type DefinitionContext,
	type GroupFlagChoice,
} from '../options.js'
import {
	AUTOMIX_DEPTH_RANGE,
	MUSIC_THRESHOLD_RANGE,
	NOM_GAIN_LIMIT_RANGE,
	RELATIVE_STEP,
	validGroup,
	validWhole,
} from './consts.js'

/** The values are the ids saved on buttons, so must never change */
export enum ActionIdGroup {
	Mute = 'group_mute',
	Preset = 'group_preset',
	Override = 'group_override',
	LastHold = 'group_lasthold',
	AutomixDepth = 'group_automixdepth',
	AutomixDepthRelative = 'group_automixdepth_rel',
	NomGainLimit = 'group_NOMgainlimit',
	NomGainLimitRelative = 'group_NOMgainlimit_rel',
	MusicThreshold = 'group_musicthreshold',
	MusicThresholdRelative = 'group_musicthreshold_rel',
	MusicInput = 'group_musicinput',
}

export type GroupFlagOptions = { groupA: GroupFlagChoice; groupB: GroupFlagChoice; groupC: GroupFlagChoice }
type GroupOptions = { group: number }
type Query = { query: boolean }

export type ActionSchemaGroup = {
	[ActionIdGroup.Mute]: { options: GroupFlagOptions & Query }
	[ActionIdGroup.Preset]: { options: GroupFlagOptions & Query }
	[ActionIdGroup.Override]: { options: GroupFlagOptions & Query }
	[ActionIdGroup.LastHold]: { options: GroupFlagOptions & Query }
	[ActionIdGroup.AutomixDepth]: { options: GroupOptions & Query & { depth: number } }
	[ActionIdGroup.AutomixDepthRelative]: { options: GroupOptions & { depth: number } }
	[ActionIdGroup.NomGainLimit]: { options: GroupOptions & Query & { nomgain: number } }
	[ActionIdGroup.NomGainLimitRelative]: { options: GroupOptions & { nomgain: number } }
	[ActionIdGroup.MusicThreshold]: { options: GroupOptions & Query & { threshold: number } }
	[ActionIdGroup.MusicThresholdRelative]: { options: GroupOptions & { threshold: number } }
	[ActionIdGroup.MusicInput]: { options: GroupOptions & Query & { input: number } }
}

const GROUP_FLAG_KEYS: Readonly<Record<GroupNumber, keyof GroupFlagOptions>> = { 1: 'groupA', 2: 'groupB', 3: 'groupC' }

type GroupFlag = 'mute' | 'preset' | 'override' | 'lastHold'

/** The mask to send for a group flag action, from each group's choice and what the unit has now */
export function groupMask(options: GroupFlagOptions, current: (group: GroupNumber) => boolean): number {
	let mask = 0
	for (const group of GROUPS) {
		const choice = options[GROUP_FLAG_KEYS[group]]
		const on = choice === TOGGLE ? !current(group) : choice === NO_CHANGE ? current(group) : choice !== 0
		if (on) mask |= GROUP_BITS[group]
	}
	return mask
}

/** The options of a group flag action as they are learnt or recorded, from what the unit has */
export function groupFlagOptions(
	flag: GroupFlag,
	groups: (group: GroupNumber) => GroupState | undefined,
): GroupFlagOptions {
	const choice = (group: GroupNumber) => (groups(group)?.[flag] ? GROUP_BITS[group] : 0) as GroupFlagChoice
	return { groupA: choice(1), groupB: choice(2), groupC: choice(3) }
}

export function getGroupActions(
	self: ModuleInstance,
	context: DefinitionContext,
): CompanionActionDefinitions<ActionSchemaGroup> {
	const group = (n: number) => self.state.group(n)

	function flagAction(code: GroupFlagCode, flag: GroupFlag, title: string, off: string, on: string) {
		const choice = (n: GroupNumber): CompanionInputFieldDropdown<keyof GroupFlagOptions, GroupFlagChoice> => {
			const choices = groupFlagChoices(n, off, on)
			return {
				id: GROUP_FLAG_KEYS[n],
				type: 'dropdown',
				label: `Group ${GROUP_LETTERS[n]} ${title}`,
				// Off
				default: choices[0].id,
				choices,
			}
		}
		return {
			name: `Group - ${title}`,
			description: `Set the ${title} state of the groups`,
			options: [choice(1), choice(2), choice(3), queryOptionFor(`group ${title.toLowerCase()} state`)],
			callback: async (
				{ options }: { options: GroupFlagOptions & Query },
				{ signal }: { signal: AbortSignal },
			): Promise<void> => {
				if (options.query) return self.sendCommand(groupFlags(code), signal)
				await self.sendCommand(
					() =>
						groupFlags(
							code,
							groupMask(options, (n) => group(n)?.[flag] ?? false),
						),
					signal,
				)
			},
			learn: () => groupFlagOptions(flag, group),
			optionsToMonitorForSubscribe: [],
			subscribe: () => self.request(groupFlags(code)),
		}
	}

	type LevelField = 'automixDepth' | 'nomGainLimit' | 'musicThreshold'
	type Range = { min: number; max: number }

	function levelOption<K extends string>(id: K, label: string, initial: number, { min, max }: Range) {
		return { id, type: 'number', label, default: initial, min, max, range: true, step: 0.1 } as const
	}

	function stepOption<K extends string>(id: K, label: string) {
		const { min, max } = RELATIVE_STEP
		return { id, type: 'number', label, default: 1, min, max, range: true, step: 0.1 } as const
	}

	async function setLevel(
		code: GroupCode,
		n: number,
		value: number,
		query: boolean,
		{ min, max }: Range,
		signal: AbortSignal,
	): Promise<void> {
		if (!validGroup(self, n)) return
		await self.sendCommand(query ? groupQuery(code, n) : groupSet(code, n, clamp(value, min, max)), signal)
	}

	/** Steps a setting from what the unit last reported, worked out when the command goes */
	async function stepLevel(
		code: GroupCode,
		field: LevelField,
		n: number,
		step: number,
		{ min, max }: Range,
		signal: AbortSignal,
	): Promise<void> {
		if (!validGroup(self, n)) return
		await self.sendCommand(() => {
			const current = group(n)?.[field]
			return current === undefined ? undefined : groupSet(code, n, clamp(current + step, min, max))
		}, signal)
	}

	function subscribeTo(code: GroupCode) {
		return {
			optionsToMonitorForSubscribe: ['group' as const],
			subscribe: ({ options }: { options: GroupOptions }): void => {
				if (isGroup(options.group)) self.request(groupQuery(code, options.group))
			},
		}
	}

	const inputs = musicInputChoices(context)

	return {
		[ActionIdGroup.Mute]: flagAction(Code.GroupMute, 'mute', 'Mute', 'On', 'Mute'),
		[ActionIdGroup.Preset]: flagAction(Code.GroupPreset, 'preset', 'Preset', 'Preset Off', 'Preset On'),
		[ActionIdGroup.Override]: flagAction(Code.GroupOverride, 'override', 'Override', 'Normal', 'Override On'),
		[ActionIdGroup.LastHold]: flagAction(Code.GroupLastHold, 'lastHold', 'Last Hold', 'Last Hold Off', 'Last Hold On'),
		[ActionIdGroup.AutomixDepth]: {
			name: 'Group - Automix Depth',
			description: 'Set the automix depth of a group',
			options: [
				groupOption,
				levelOption('depth', 'Depth', -15, AUTOMIX_DEPTH_RANGE),
				queryOptionFor('group automix depth'),
			],
			callback: async ({ options }, { signal }) =>
				setLevel(Code.GroupAutomixDepth, options.group, options.depth, options.query, AUTOMIX_DEPTH_RANGE, signal),
			learn: ({ options }) => {
				const value = group(options.group)?.automixDepth
				return value === undefined ? undefined : { depth: value }
			},
			...subscribeTo(Code.GroupAutomixDepth),
		},
		[ActionIdGroup.AutomixDepthRelative]: {
			name: 'Group - Automix Depth, Relative',
			description: 'Adjust the automix depth of a group',
			options: [groupOption, stepOption('depth', 'Depth')],
			callback: async ({ options }, { signal }) =>
				stepLevel(Code.GroupAutomixDepth, 'automixDepth', options.group, options.depth, AUTOMIX_DEPTH_RANGE, signal),
			...subscribeTo(Code.GroupAutomixDepth),
		},
		[ActionIdGroup.NomGainLimit]: {
			name: 'Group - NOM Gain Limit',
			description: 'Set the NOM gain limit of a group',
			options: [
				groupOption,
				levelOption('nomgain', 'NOM Gain Limit', 1, NOM_GAIN_LIMIT_RANGE),
				queryOptionFor('group NOM gain limit'),
			],
			callback: async ({ options }, { signal }) =>
				setLevel(Code.GroupNomGainLimit, options.group, options.nomgain, options.query, NOM_GAIN_LIMIT_RANGE, signal),
			learn: ({ options }) => {
				const value = group(options.group)?.nomGainLimit
				return value === undefined ? undefined : { nomgain: value }
			},
			...subscribeTo(Code.GroupNomGainLimit),
		},
		[ActionIdGroup.NomGainLimitRelative]: {
			name: 'Group - NOM Gain Limit, Relative',
			description: 'Adjust the NOM gain limit of a group',
			options: [groupOption, stepOption('nomgain', 'NOM Gain Limit')],
			callback: async ({ options }, { signal }) =>
				stepLevel(Code.GroupNomGainLimit, 'nomGainLimit', options.group, options.nomgain, NOM_GAIN_LIMIT_RANGE, signal),
			...subscribeTo(Code.GroupNomGainLimit),
		},
		[ActionIdGroup.MusicThreshold]: {
			name: 'Group - Music System Threshold',
			description: 'Set the Music System Threshold of a group',
			options: [
				groupOption,
				levelOption('threshold', 'Music System Threshold', -10, MUSIC_THRESHOLD_RANGE),
				queryOptionFor('group music system threshold'),
			],
			callback: async ({ options }, { signal }) =>
				setLevel(
					Code.GroupMusicThreshold,
					options.group,
					options.threshold,
					options.query,
					MUSIC_THRESHOLD_RANGE,
					signal,
				),
			learn: ({ options }) => {
				const value = group(options.group)?.musicThreshold
				return value === undefined ? undefined : { threshold: value }
			},
			...subscribeTo(Code.GroupMusicThreshold),
		},
		[ActionIdGroup.MusicThresholdRelative]: {
			name: 'Group - Music System Threshold, Relative',
			description: 'Adjust the Music System Threshold of a group',
			options: [groupOption, stepOption('threshold', 'Music System Threshold')],
			callback: async ({ options }, { signal }) =>
				stepLevel(
					Code.GroupMusicThreshold,
					'musicThreshold',
					options.group,
					options.threshold,
					MUSIC_THRESHOLD_RANGE,
					signal,
				),
			...subscribeTo(Code.GroupMusicThreshold),
		},
		[ActionIdGroup.MusicInput]: {
			name: 'Group - Music System Threshold Input',
			description: 'Set the music system Threshold input of a group',
			options: [
				groupOption,
				{
					id: 'input',
					type: 'dropdown',
					label: 'Music System Threshold Input',
					// The first input. The choices are built at runtime, so there is no fixed entry to reference
					default: 1,
					choices: inputs,
					expressionDescription: `Should return an input number, 1 to ${MAX_MUSIC_INPUT}`,
				},
				queryOptionFor('group music system threshold input'),
			],
			callback: async ({ options }, { signal }) => {
				if (!validGroup(self, options.group)) return
				if (options.query) return self.sendCommand(groupQuery(Code.GroupMusicInput, options.group), signal)
				if (!validWhole(self, options.input, 1, MAX_MUSIC_INPUT, 'music system input')) return
				await self.sendCommand(groupSet(Code.GroupMusicInput, options.group, options.input), signal)
			},
			learn: ({ options }) => {
				const value = group(options.group)?.musicInput
				return value === undefined ? undefined : { input: value }
			},
			...subscribeTo(Code.GroupMusicInput),
		},
	}
}
