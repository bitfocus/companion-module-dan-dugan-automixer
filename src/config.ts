import { Regex, type DropdownChoice, type SomeCompanionConfigField } from '@companion-module/base'
import {
	MAX_CHANNELS,
	MESSAGE_GAP_MS,
	MIN_CHANNELS,
	MODEL_CHANNELS,
	MODEL_M,
	MODEL_N,
	MODEL_NAMES,
	isWhole,
} from './api/index.js'

/** The models the config offers. The unit reports its own, which wins once connected */
export const ConfiguredModel = [MODEL_M, MODEL_N] as const
export type ConfiguredModel = (typeof ConfiguredModel)[number]

/** Meter poll interval in ms, 0 for off */
export const MeterRate = [0, 250, 500, 1000, 2000, 4000] as const
export type MeterRate = (typeof MeterRate)[number]

/** An index into {@link MESSAGE_GAP_MS} */
export const MessageRate = [0, 1, 2, 3] as const
export type MessageRate = (typeof MessageRate)[number]

/** The unsolicited message level asked for on connecting. Level 2 adds metering, which misbehaves over TCP */
export const SubscriptionLevel = [0, 1] as const
export type SubscriptionLevel = (typeof SubscriptionLevel)[number]

/** The channel count that means the model's own */
export const UNIT_DEFAULT_CHANNELS = 1

// A type alias, not an interface: InstanceTypes requires config to satisfy JsonObject, and interfaces don't
export type ModuleConfig = {
	host: string
	port: number
	/** Seconds between polls of the scenes and channel names, 0 for none */
	keepAlive: number
	meterRate: MeterRate
	model: ConfiguredModel
	/** {@link UNIT_DEFAULT_CHANNELS}, or from {@link MIN_CHANNELS} to {@link MAX_CHANNELS} */
	channels: number
	rate: MessageRate
	subscription: SubscriptionLevel
	/** dB of automix gain at or above which a channel counts as talking */
	isTalkingThreshold: number
}

export const DEFAULT_PORT = 23

const METER_RATE_CHOICES = [
	{ id: 0, label: 'Off' },
	{ id: 250, label: '250 ms' },
	{ id: 500, label: '500 ms' },
	{ id: 1000, label: '1 Seconds' },
	{ id: 2000, label: '2 Seconds' },
	{ id: 4000, label: '4 Seconds' },
] as const satisfies DropdownChoice<MeterRate>[]

const MODEL_CHOICES = [
	{ id: MODEL_M, label: MODEL_NAMES[MODEL_M] ?? 'Model-M' },
	{ id: MODEL_N, label: MODEL_NAMES[MODEL_N] ?? 'Model-N' },
] as const satisfies DropdownChoice<ConfiguredModel>[]

const CHANNEL_CHOICES: DropdownChoice<number>[] = [
	{ id: UNIT_DEFAULT_CHANNELS, label: 'Unit Default' },
	...Array.from({ length: MAX_CHANNELS - MIN_CHANNELS + 1 }, (_, i) => ({
		id: MIN_CHANNELS + i,
		label: `${MIN_CHANNELS + i} Automix Channels`,
	})),
]

const MESSAGE_RATE_CHOICES = [
	{ id: 0, label: 'Fast' },
	{ id: 1, label: 'Medium' },
	{ id: 2, label: 'Slow' },
	{ id: 3, label: 'Very Slow' },
] as const satisfies DropdownChoice<MessageRate>[]

const SUBSCRIPTION_CHOICES = [
	{ id: 0, label: 'Off' },
	{ id: 1, label: 'On' },
] as const satisfies DropdownChoice<SubscriptionLevel>[]

/** The channel count the config gives for a model, resolving the unit default */
export function configuredChannels(config: Pick<ModuleConfig, 'channels'>, model: number): number {
	if (isWhole(config.channels, MIN_CHANNELS, MAX_CHANNELS)) return config.channels
	return MODEL_CHANNELS[model] ?? MIN_CHANNELS
}

/** The gap between messages for the config's messaging rate. An unknown rate gets the slowest */
export function messageGap(config: Pick<ModuleConfig, 'rate'>): number {
	return MESSAGE_GAP_MS[config.rate] ?? MESSAGE_GAP_MS[MESSAGE_GAP_MS.length - 1]
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target Host',
			width: 8,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port',
			default: DEFAULT_PORT,
			width: 4,
			min: 1,
			max: 65535,
			tooltip: 'Port 23 or 9776',
		},
		{
			type: 'number',
			id: 'keepAlive',
			label: 'Poll Interval',
			default: 60,
			width: 2,
			min: 0,
			max: 180,
			tooltip: 'Seconds, set to 0 to turn off',
		},
		{
			type: 'dropdown',
			id: 'meterRate',
			label: 'Meter rate',
			choices: METER_RATE_CHOICES,
			default: METER_RATE_CHOICES[3].id,
			width: 4,
		},
		{
			type: 'dropdown',
			id: 'model',
			label: 'Dugan Model',
			choices: MODEL_CHOICES,
			default: MODEL_CHOICES[0].id,
			width: 4,
		},
		{
			type: 'dropdown',
			id: 'channels',
			label: 'Automix Channels',
			choices: CHANNEL_CHOICES,
			// Unit Default
			default: UNIT_DEFAULT_CHANNELS,
			width: 4,
		},
		{
			type: 'dropdown',
			id: 'rate',
			label: 'Messaging rate',
			choices: MESSAGE_RATE_CHOICES,
			default: MESSAGE_RATE_CHOICES[1].id,
			width: 4,
		},
		{
			type: 'dropdown',
			id: 'subscription',
			label: 'Unsolicited Message Subscription',
			choices: SUBSCRIPTION_CHOICES,
			default: SUBSCRIPTION_CHOICES[1].id,
			width: 4,
			tooltip: 'This will be forced on if using feedbacks',
		},
		{
			type: 'number',
			id: 'isTalkingThreshold',
			label: 'Talking Threshold',
			default: -3,
			width: 2,
			min: -24,
			max: 0,
			range: true,
			step: 0.1,
			tooltip: 'Automix gain threshold for Is Talking function',
		},
	]
}
