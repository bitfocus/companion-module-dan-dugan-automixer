import type { CompanionActionDefinitions } from '@companion-module/base'
import { Code, channelName, channelQuery, channelSet, isWhole } from '../api/index.js'
import type ModuleInstance from '../main.js'
import {
	BYPASS_CHOICES,
	CHANNEL_MODE_CHOICES,
	GROUP_CHOICES,
	OFF_ON_TOGGLE_CHOICES,
	OVERRIDE_CHOICES,
	channelOption,
	clamp,
	queryOption,
	queryOptionFor,
	resolveToggle,
	type DefinitionContext,
	type OffOnToggle,
} from '../options.js'
import { RELATIVE_STEP, WEIGHT_RANGE, validChannel } from './consts.js'

/** The values are the ids saved on buttons, so must never change */
export enum ActionIdChannel {
	Mode = 'channel_mode',
	Preset = 'channel_preset',
	Bypass = 'channel_bypass',
	Override = 'channel_override',
	Weight = 'channel_weight',
	WeightRelative = 'channel_weight_rel',
	Music = 'channel_music_mode',
	Nom = 'channel_NOM_mode',
	GroupAssign = 'channel_group_assign',
	Name = 'channel_name',
}

type ChannelOptions = { channel: number }
type Query = { query: boolean }

export type ActionSchemaChannel = {
	[ActionIdChannel.Mode]: { options: ChannelOptions & Query & { mode: number } }
	[ActionIdChannel.Preset]: { options: ChannelOptions & Query & { preset: number } }
	[ActionIdChannel.Bypass]: { options: ChannelOptions & Query & { bypass: OffOnToggle } }
	[ActionIdChannel.Override]: { options: ChannelOptions & Query & { override: OffOnToggle } }
	[ActionIdChannel.Weight]: { options: ChannelOptions & Query & { weight: number } }
	[ActionIdChannel.WeightRelative]: { options: ChannelOptions & { weight: number } }
	[ActionIdChannel.Music]: { options: ChannelOptions & Query & { music: OffOnToggle } }
	[ActionIdChannel.Nom]: { options: ChannelOptions & Query & { nom: OffOnToggle } }
	[ActionIdChannel.GroupAssign]: { options: ChannelOptions & Query & { group: number } }
	[ActionIdChannel.Name]: { options: ChannelOptions & Query & { name: string } }
}

/** Asks for a channel's setting once per connection, so toggles, relative changes and learn have it */
function subscribeTo(self: ModuleInstance, code: Parameters<typeof channelQuery>[0]) {
	return {
		optionsToMonitorForSubscribe: ['channel' as const],
		subscribe: ({ options }: { options: ChannelOptions }): void => {
			if (isWhole(options.channel, 1, self.channelCount)) self.request(channelQuery(code, options.channel))
		},
	}
}

export function getChannelActions(
	self: ModuleInstance,
	context: DefinitionContext,
): CompanionActionDefinitions<ActionSchemaChannel> {
	const channel = channelOption(context)
	const state = (ch: number) => self.state.channel(ch)

	return {
		[ActionIdChannel.Mode]: {
			name: 'Channel - Mode',
			description: 'Set the mode of a channel',
			options: [
				channel,
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: CHANNEL_MODE_CHOICES[1].id,
					choices: CHANNEL_MODE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				if (!validChannel(self, options.channel)) return
				const command = options.query
					? channelQuery(Code.ChannelMode, options.channel)
					: channelSet(Code.ChannelMode, options.channel, options.mode)
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { mode: ch.mode }
			},
			...subscribeTo(self, Code.ChannelMode),
		},
		[ActionIdChannel.Preset]: {
			name: 'Channel - Preset',
			description: 'Set the preset of a channel',
			options: [
				channel,
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					default: CHANNEL_MODE_CHOICES[1].id,
					choices: CHANNEL_MODE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				if (!validChannel(self, options.channel)) return
				const command = options.query
					? channelQuery(Code.ChannelPreset, options.channel)
					: channelSet(Code.ChannelPreset, options.channel, options.preset)
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { preset: ch.preset }
			},
			...subscribeTo(self, Code.ChannelPreset),
		},
		[ActionIdChannel.Bypass]: {
			name: 'Channel - Bypass',
			description: 'Switch a channel bypass on/off',
			options: [
				channel,
				{ id: 'bypass', type: 'dropdown', label: 'Bypass', default: BYPASS_CHOICES[1].id, choices: BYPASS_CHOICES },
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				const ch = options.channel
				if (!validChannel(self, ch)) return
				if (options.query) return self.sendCommand(channelQuery(Code.ChannelBypass, ch), signal)
				await self.sendCommand(
					() => channelSet(Code.ChannelBypass, ch, resolveToggle(options.bypass, state(ch)?.bypass ?? false)),
					signal,
				)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { bypass: ch.bypass ? 1 : 0 }
			},
			...subscribeTo(self, Code.ChannelBypass),
		},
		[ActionIdChannel.Override]: {
			name: 'Channel - Override',
			description: 'Switch a channel override on/off',
			options: [
				channel,
				{
					id: 'override',
					type: 'dropdown',
					label: 'Override',
					default: OVERRIDE_CHOICES[0].id,
					choices: OVERRIDE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				const ch = options.channel
				if (!validChannel(self, ch)) return
				if (options.query) return self.sendCommand(channelQuery(Code.ChannelOverride, ch), signal)
				await self.sendCommand(
					() => channelSet(Code.ChannelOverride, ch, resolveToggle(options.override, state(ch)?.override ?? false)),
					signal,
				)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { override: ch.override ? 1 : 0 }
			},
			...subscribeTo(self, Code.ChannelOverride),
		},
		[ActionIdChannel.Weight]: {
			name: 'Channel - Weight',
			description: 'Set the automix weight of a channel',
			options: [
				channel,
				{
					id: 'weight',
					type: 'number',
					label: 'Weight',
					default: 0,
					min: WEIGHT_RANGE.min,
					max: WEIGHT_RANGE.max,
					range: true,
					step: 0.1,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				if (!validChannel(self, options.channel)) return
				const command = options.query
					? channelQuery(Code.ChannelWeight, options.channel)
					: channelSet(Code.ChannelWeight, options.channel, clamp(options.weight, WEIGHT_RANGE.min, WEIGHT_RANGE.max))
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { weight: ch.weight }
			},
			...subscribeTo(self, Code.ChannelWeight),
		},
		[ActionIdChannel.WeightRelative]: {
			name: 'Channel - Weight, Relative',
			description: 'Adjust automix weight of a channel',
			options: [
				channel,
				{
					id: 'weight',
					type: 'number',
					label: 'Weight',
					default: 1,
					min: RELATIVE_STEP.min,
					max: RELATIVE_STEP.max,
					range: true,
					step: 0.1,
				},
			],
			callback: async ({ options }, { signal }) => {
				const ch = options.channel
				if (!validChannel(self, ch)) return
				await self.sendCommand(() => {
					const weight = (state(ch)?.weight ?? 0) + options.weight
					return channelSet(Code.ChannelWeight, ch, clamp(weight, WEIGHT_RANGE.min, WEIGHT_RANGE.max))
				}, signal)
			},
			...subscribeTo(self, Code.ChannelWeight),
		},
		[ActionIdChannel.Music]: {
			name: 'Channel - Music Mode',
			description: 'Switch a channel music mode on/off',
			options: [
				channel,
				{
					id: 'music',
					type: 'dropdown',
					label: 'Music Mode',
					default: OFF_ON_TOGGLE_CHOICES[1].id,
					choices: OFF_ON_TOGGLE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				const ch = options.channel
				if (!validChannel(self, ch)) return
				if (options.query) return self.sendCommand(channelQuery(Code.ChannelMusic, ch), signal)
				await self.sendCommand(
					() => channelSet(Code.ChannelMusic, ch, resolveToggle(options.music, state(ch)?.music ?? false)),
					signal,
				)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { music: ch.music ? 1 : 0 }
			},
			...subscribeTo(self, Code.ChannelMusic),
		},
		[ActionIdChannel.Nom]: {
			name: 'Channel - NOM Mode',
			description: 'Switch a channel NOM mode on/off',
			options: [
				channel,
				{
					id: 'nom',
					type: 'dropdown',
					label: 'NOM Mode',
					default: OFF_ON_TOGGLE_CHOICES[1].id,
					choices: OFF_ON_TOGGLE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				const ch = options.channel
				if (!validChannel(self, ch)) return
				if (options.query) return self.sendCommand(channelQuery(Code.ChannelNom, ch), signal)
				await self.sendCommand(
					() => channelSet(Code.ChannelNom, ch, resolveToggle(options.nom, state(ch)?.nom ?? false)),
					signal,
				)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { nom: ch.nom ? 1 : 0 }
			},
			...subscribeTo(self, Code.ChannelNom),
		},
		[ActionIdChannel.GroupAssign]: {
			name: 'Channel - Group Assign',
			description: 'Set the group of a channel',
			options: [
				channel,
				{
					id: 'group',
					type: 'dropdown',
					label: 'Group Assignment',
					default: GROUP_CHOICES[0].id,
					choices: GROUP_CHOICES,
				},
				queryOptionFor('group assignment'),
			],
			callback: async ({ options }, { signal }) => {
				if (!validChannel(self, options.channel)) return
				const command = options.query
					? channelQuery(Code.ChannelGroup, options.channel)
					: channelSet(Code.ChannelGroup, options.channel, options.group)
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { group: ch.group }
			},
			...subscribeTo(self, Code.ChannelGroup),
		},
		[ActionIdChannel.Name]: {
			name: 'Channel - Name',
			description: 'Name a Channel',
			options: [
				channel,
				{
					id: 'name',
					type: 'textinput',
					label: 'Channel Name',
					default: 'Channel 1',
					useVariables: true,
					tooltip: 'Max Length: 16 characters, up to the first of , * ; or :',
				},
				queryOptionFor('current name'),
			],
			callback: async ({ options }, { signal }) => {
				if (!validChannel(self, options.channel)) return
				if (options.query) return self.sendCommand(channelQuery(Code.ChannelName, options.channel), signal)
				let command
				try {
					command = channelName(options.channel, options.name)
				} catch {
					self.log('warn', `Not a valid channel name: "${options.name}"`)
					return
				}
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const ch = state(options.channel)
				return ch && { name: ch.name }
			},
			...subscribeTo(self, Code.ChannelName),
		},
	}
}
