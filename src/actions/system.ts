import { Regex, type CompanionActionDefinitions, type DropdownChoice } from '@companion-module/base'
import {
	Code,
	MAX_CHANNELS,
	MIN_CHANNELS,
	channelNames,
	command,
	network,
	sceneNames,
	systemName,
	type Command,
	type NetworkCode,
} from '../api/index.js'
import type ModuleInstance from '../main.js'
import {
	channelOffsetChoices,
	clockSourceChoices,
	queryOption,
	queryOptionFor,
	type DefinitionContext,
	type OffOn,
} from '../options.js'
import { isChoice, validWhole } from './consts.js'

/** The values are the ids saved on buttons, so must never change */
export enum ActionIdSystem {
	Subscribe = 'system_subscribe',
	LinkGroup = 'system_linkgroup',
	ClockSource = 'system_clocksource',
	AdatMirror = 'system_ADATmirror',
	AutomixChannels = 'system_automixchannels',
	ChannelOffset = 'system_channeloffset',
	BlinkMode = 'system_blinkmode',
	Dhcp = 'system_DHCP',
	QuerySystem = 'query_system',
	Name = 'system_name',
	Network = 'system_network',
	QueryMeters = 'query_meters',
	QueryBulkConfig = 'query_bulk_config',
	QueryNameList = 'query_namelist',
}

export type SystemQueryCode =
	| Code.SystemConfig
	| Code.Firmware
	| Code.Connections
	| Code.Resources
	| Code.SwitchHeadroom
	| Code.SampleRate
	| Code.Master
export type MeterQueryCode =
	| Code.MeterStatus
	| Code.MeterAutomixGain
	| Code.MeterSignalPresence
	| Code.MeterInputPeaks
	| Code.MeterOutputPeaks
	| Code.MeterMusicReference
	| Code.MeterNomGain
	| Code.MeterMatrixOutput
export type BulkCode = Code.ChannelBulk | Code.MatrixBulk
export type NameListCode = Code.ChannelNameList | Code.SceneList
export type AdatMirror = 1 | 2

type Query = { query: boolean }

export type ActionSchemaSystem = {
	[ActionIdSystem.Subscribe]: { options: Query & { subscribe: OffOn } }
	[ActionIdSystem.LinkGroup]: { options: Query & { linkgroup: number } }
	[ActionIdSystem.ClockSource]: { options: Query & { clock: number } }
	[ActionIdSystem.AdatMirror]: { options: Query & { mirror: AdatMirror } }
	[ActionIdSystem.AutomixChannels]: { options: Query & { channels: number } }
	[ActionIdSystem.ChannelOffset]: { options: Query & { offset: number } }
	[ActionIdSystem.BlinkMode]: { options: Query & { blink: OffOn } }
	[ActionIdSystem.Dhcp]: { options: Query & { dhcp: OffOn } }
	[ActionIdSystem.QuerySystem]: { options: { mode: SystemQueryCode } }
	[ActionIdSystem.Name]: { options: Query & { name: string } }
	[ActionIdSystem.Network]: { options: { mode: NetworkCode; IP: string } }
	[ActionIdSystem.QueryMeters]: { options: { mode: MeterQueryCode } }
	[ActionIdSystem.QueryBulkConfig]: { options: { mode: BulkCode } }
	[ActionIdSystem.QueryNameList]: { options: { mode: NameListCode; first: number; count: number } }
}

const SUBSCRIBE_CHOICES = [
	{ id: 0, label: 'Off' },
	{ id: 1, label: 'On' },
] as const satisfies DropdownChoice<OffOn>[]

const ADAT_MIRROR_CHOICES = [
	{ id: 1, label: '8 Channels' },
	{ id: 2, label: '16 Channels' },
] as const satisfies DropdownChoice<AdatMirror>[]

const OFF_ON_CHOICES = [
	{ id: 0, label: 'Off' },
	{ id: 1, label: 'On' },
] as const satisfies DropdownChoice<OffOn>[]

const SYSTEM_QUERY_CHOICES = [
	{ id: Code.SystemConfig, label: 'System Configuration' },
	{ id: Code.Firmware, label: 'Firmware Versions' },
	{ id: Code.Connections, label: 'Client Connections' },
	{ id: Code.Resources, label: 'Resource Useage' },
	{ id: Code.SwitchHeadroom, label: 'Switch Headroom' },
	{ id: Code.SampleRate, label: 'Sample Rate' },
	{ id: Code.Master, label: 'Master' },
] as const satisfies DropdownChoice<SystemQueryCode>[]

const NETWORK_CHOICES = [
	{ id: Code.IpAddress, label: 'IP Address' },
	{ id: Code.Netmask, label: 'Subnet Mask' },
	{ id: Code.Gateway, label: 'Gateway' },
] as const satisfies DropdownChoice<NetworkCode>[]

// GSC is left out: the Model N answers it as GSS, signal presence
const METER_CHOICES = [
	{ id: Code.MeterStatus, label: 'Channel Status' },
	{ id: Code.MeterAutomixGain, label: 'Automix Gains' },
	{ id: Code.MeterSignalPresence, label: 'Signal Presence' },
	{ id: Code.MeterInputPeaks, label: 'Input Peaks' },
	{ id: Code.MeterOutputPeaks, label: 'Output Peaks' },
	{ id: Code.MeterMusicReference, label: 'Music Reference Peaks' },
	{ id: Code.MeterNomGain, label: 'NOM Gain Limits' },
	{ id: Code.MeterMatrixOutput, label: 'Matrix Output Meters' },
] as const satisfies DropdownChoice<MeterQueryCode>[]

const BULK_CHOICES = [
	{ id: Code.ChannelBulk, label: 'Channels Parameters' },
	{ id: Code.MatrixBulk, label: 'Matrix Crosspoints' },
] as const satisfies DropdownChoice<BulkCode>[]

const NAME_LIST_CHOICES = [
	{ id: Code.ChannelNameList, label: 'Channels' },
	{ id: Code.SceneList, label: 'Scenes' },
] as const satisfies DropdownChoice<NameListCode>[]

export function getSystemActions(
	self: ModuleInstance,
	context: DefinitionContext,
): CompanionActionDefinitions<ActionSchemaSystem> {
	/** Queries a setting, or sets it to value */
	const queryOrSet = async (code: Code, query: boolean, value: number, signal: AbortSignal): Promise<void> =>
		self.sendCommand(query ? command(code) : command(code, value), signal)

	/** Sends a command built from text typed in, logging rather than throwing if it isn't usable */
	async function sendBuilt(build: () => Command, what: string, signal: AbortSignal): Promise<void> {
		let built: Command
		try {
			built = build()
		} catch (err) {
			self.log('warn', `Not a valid ${what}: ${err instanceof Error ? err.message : String(err)}`)
			return
		}
		await self.sendCommand(built, signal)
	}

	return {
		[ActionIdSystem.Subscribe]: {
			name: 'System - Subscribe Unsolicited',
			description: 'Subscribe to unsolicited paramter changes',
			options: [
				{
					id: 'subscribe',
					type: 'dropdown',
					label: 'Subscribe',
					default: SUBSCRIBE_CHOICES[1].id,
					choices: SUBSCRIBE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => queryOrSet(Code.Subscribe, options.query, options.subscribe, signal),
		},
		[ActionIdSystem.LinkGroup]: {
			name: 'System - Link Group',
			description: 'Set the link group',
			options: [
				{
					id: 'linkgroup',
					type: 'number',
					label: 'Link Group Address',
					default: 1,
					min: 0,
					max: 254,
					range: true,
					step: 1,
					asInteger: true,
					tooltip: 'Link group parameters are multicast to 237.1.4.<addr>',
				},
				queryOptionFor('current link group'),
			],
			callback: async ({ options }, { signal }) => {
				if (!options.query && !validWhole(self, options.linkgroup, 0, 254, 'link group')) return
				await queryOrSet(Code.LinkGroup, options.query, options.linkgroup, signal)
			},
		},
		[ActionIdSystem.ClockSource]: {
			name: 'System - Clock Source',
			description: 'Set the clock source',
			options: [
				{ id: 'clock', type: 'dropdown', label: 'Clock Source', default: 0, choices: clockSourceChoices(context) },
				queryOptionFor('current clock source'),
			],
			callback: async ({ options }, { signal }) => {
				if (!options.query && !validWhole(self, options.clock, 0, 3, 'clock source')) return
				await queryOrSet(Code.ClockSource, options.query, options.clock, signal)
			},
		},
		[ActionIdSystem.AdatMirror]: {
			name: 'System - ADAT Mirror',
			description: 'Set the number of input channels echoed to ADAT outputs when in Dante mode',
			options: [
				{
					id: 'mirror',
					type: 'dropdown',
					label: 'ADAT mirror',
					default: ADAT_MIRROR_CHOICES[0].id,
					choices: ADAT_MIRROR_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				if (!options.query && !isChoice(self, ADAT_MIRROR_CHOICES, options.mirror)) return
				await queryOrSet(Code.AdatMirror, options.query, options.mirror, signal)
			},
		},
		[ActionIdSystem.AutomixChannels]: {
			name: 'System - Automix Channels',
			description: 'Set the number of dugan automix channels',
			options: [
				{
					id: 'channels',
					type: 'number',
					label: 'Automix Channels',
					default: context.channelCount,
					min: MIN_CHANNELS,
					max: MAX_CHANNELS,
					range: true,
					step: 1,
					asInteger: true,
					tooltip: 'Automix Channel Count',
				},
				queryOptionFor('current configured automix channels'),
			],
			callback: async ({ options }, { signal }) => {
				if (!options.query && !validWhole(self, options.channels, MIN_CHANNELS, MAX_CHANNELS, 'channel count')) {
					return
				}
				await queryOrSet(Code.AutomixChannels, options.query, options.channels, signal)
			},
		},
		[ActionIdSystem.ChannelOffset]: {
			name: 'System - Automix Channel Offset',
			description: 'Set the input channel offset',
			options: [
				{
					id: 'offset',
					type: 'dropdown',
					label: 'Input Offset',
					// The first input
					default: 1,
					choices: channelOffsetChoices(context),
					tooltip: 'Input channel mapped to Automix Channel 1',
				},
				queryOptionFor('current configured channel offset'),
			],
			callback: async ({ options }, { signal }) => {
				const last = MAX_CHANNELS - self.channelCount + 1
				if (!options.query && !validWhole(self, options.offset, 1, last, 'input offset')) return
				await queryOrSet(Code.ChannelOffset, options.query, options.offset, signal)
			},
		},
		[ActionIdSystem.BlinkMode]: {
			name: 'System - Blink Mode',
			description: 'Set the blink mode',
			options: [
				{ id: 'blink', type: 'dropdown', label: 'Blink Mode', default: OFF_ON_CHOICES[1].id, choices: OFF_ON_CHOICES },
				queryOption,
			],
			callback: async ({ options }, { signal }) => queryOrSet(Code.BlinkMode, options.query, options.blink, signal),
		},
		[ActionIdSystem.Dhcp]: {
			name: 'System - Network DHCP',
			description: 'Set DHCP',
			options: [
				{
					id: 'dhcp',
					type: 'dropdown',
					label: 'DHCP. Requires reboot to take effect',
					default: OFF_ON_CHOICES[1].id,
					choices: OFF_ON_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => queryOrSet(Code.Dhcp, options.query, options.dhcp, signal),
		},
		[ActionIdSystem.QuerySystem]: {
			name: 'Query - System',
			description: 'Query system state and write to logs',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: SYSTEM_QUERY_CHOICES[0].id,
					choices: SYSTEM_QUERY_CHOICES,
				},
			],
			callback: async ({ options }, { signal }) => {
				if (isChoice(self, SYSTEM_QUERY_CHOICES, options.mode)) await self.sendCommand(command(options.mode), signal)
			},
		},
		[ActionIdSystem.Name]: {
			name: 'System - Name',
			description: 'Set unit name',
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'Unit Name',
					default: 'Dugan Model N',
					useVariables: true,
					tooltip: 'Max Length: 16 characters, up to the first of , * ; or :',
				},
				queryOptionFor('current configured unit name'),
			],
			callback: async ({ options }, { signal }) => {
				if (options.query) return self.sendCommand(command(Code.SystemName), signal)
				await sendBuilt(() => systemName(options.name), 'name', signal)
			},
		},
		[ActionIdSystem.Network]: {
			name: 'System - Network',
			description: 'Set unit IP, Netmask or Gateway. Requires reboot to take effect',
			options: [
				{ id: 'mode', type: 'dropdown', label: 'Mode', default: NETWORK_CHOICES[0].id, choices: NETWORK_CHOICES },
				{ id: 'IP', type: 'textinput', label: 'IP Address', default: '192.168.1.1', regex: Regex.IP },
			],
			callback: async ({ options }, { signal }) => {
				if (!isChoice(self, NETWORK_CHOICES, options.mode)) return
				await sendBuilt(() => network(options.mode, options.IP), 'address', signal)
			},
		},
		[ActionIdSystem.QueryMeters]: {
			name: 'Metering',
			description: 'Get metering data',
			options: [
				{ id: 'mode', type: 'dropdown', label: 'Meter Type', default: METER_CHOICES[0].id, choices: METER_CHOICES },
			],
			callback: async ({ options }, { signal }) => {
				if (isChoice(self, METER_CHOICES, options.mode)) await self.sendCommand(command(options.mode), signal)
			},
		},
		[ActionIdSystem.QueryBulkConfig]: {
			name: 'Query - Bulk Config',
			description: 'Get all channel parameters or matrix cross points',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Channels or Matrix',
					default: BULK_CHOICES[0].id,
					choices: BULK_CHOICES,
				},
			],
			callback: async ({ options }, { signal }) => {
				if (isChoice(self, BULK_CHOICES, options.mode)) await self.sendCommand(command(options.mode), signal)
			},
		},
		[ActionIdSystem.QueryNameList]: {
			name: 'Query - Name List',
			description: 'Query a list of channel or scene names',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Channel or Scenes',
					default: NAME_LIST_CHOICES[0].id,
					choices: NAME_LIST_CHOICES,
				},
				{
					id: 'first',
					type: 'number',
					label: 'First name to recall',
					default: 1,
					min: 1,
					max: MAX_CHANNELS,
					step: 1,
					range: true,
					asInteger: true,
				},
				{
					id: 'count',
					type: 'number',
					label: 'Number of names to recall',
					default: context.channelCount,
					min: 1,
					max: MAX_CHANNELS,
					step: 1,
					range: true,
					asInteger: true,
				},
			],
			callback: async ({ options }, { signal }) => {
				if (!isChoice(self, NAME_LIST_CHOICES, options.mode)) return
				const { first, count } = options
				await sendBuilt(
					() => (options.mode === Code.ChannelNameList ? channelNames(first, count) : sceneNames(first, count)),
					'name list',
					signal,
				)
			},
		},
	}
}
