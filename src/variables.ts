import type { CompanionVariableDefinitions } from '@companion-module/base'
import {
	GROUPS,
	MATRICES,
	MATRIX_INPUTS,
	MAX_CHANNELS,
	MODEL_M,
	MODEL_N,
	MODEL_NAMES,
	type DeviceInfo,
} from './api/index.js'
import type ModuleInstance from './main.js'
import type { Change, DeviceState } from './state.js'

/** What a system variable holds until the unit has reported it, as it always has */
export const UNKNOWN = 'unknown'
type Unknown = typeof UNKNOWN

/*
 * The ids are what users reference in $(dugan:...), so must never change: hardwareRevsion and mallocHeadFree keep the
 * spelling they have always had.
 */
type SystemVariables = {
	deviceType: string
	hostName: string
	serialNumber: string
	firmwareVersion: string
	firmwareSecVersion: string
	fpgaVersion: string
	hardwareRevsion: string
	macAddress: string
	ipAddress: string
	netMask: string
	gateway: string
	dhcp: boolean | Unknown
	channelCount: number | Unknown
	linkGroup: number | Unknown
	clockSource: string
	adatMirror: string
	inputOffset: number | Unknown
	blinkMode: boolean | Unknown
	clientUDP: number | Unknown
	clientTCP: number | Unknown
	sampleRate: string
	switchHeadroom: number | Unknown
	master: boolean | Unknown
	heartBeat: number | Unknown
	lwip: number | Unknown
	dsp: number | Unknown
	tcpip: number | Unknown
	macRX: number | Unknown
	macTX: number | Unknown
	rtosHeapFree: number | Unknown
	mallocHeadFree: number | Unknown
}

type SceneVariables = {
	sceneCount: number | Unknown
	sceneActive: string
	sceneActiveIndex: number | Unknown
	sceneActiveChanged: boolean
}

type TalkingVariables = {
	isTalkingChannel: number
	isTalkingName: string
}

type ChannelVariables = Record<`channelName${number}`, string> &
	Record<`channelWeight${number}` | `channelAmixGain${number}`, number> &
	Record<`channelInputLevel${number}` | `channelOutputLevel${number}`, number>

type GroupVariables = Record<
	`groupNOM${number}` | `groupNOMpeak${number}` | `groupAD${number}` | `groupMST${number}` | `groupMSTgain${number}`,
	number
>

type MatrixVariables = Record<
	`matrixOutFader${number}` | `matrixOutLevel${number}` | `matrix${number}Xpoint${number}`,
	number
>

export type VariablesSchema = SystemVariables &
	SceneVariables &
	TalkingVariables &
	ChannelVariables &
	GroupVariables &
	MatrixVariables

type Values = Partial<VariablesSchema>

const SYSTEM_NAMES: Readonly<Record<keyof SystemVariables, string>> = {
	deviceType: 'Device Type',
	hostName: 'Host Name',
	serialNumber: 'Serial Number',
	firmwareVersion: 'Firmware Version',
	firmwareSecVersion: 'Secondary Firmware Version',
	fpgaVersion: 'FPGA Version',
	hardwareRevsion: 'Hardware Revision',
	macAddress: 'MAC Address',
	ipAddress: 'IP Address',
	netMask: 'Subnet Mask',
	gateway: 'Gateway',
	dhcp: 'DHCP',
	channelCount: 'Channel Count',
	linkGroup: 'Link Group',
	clockSource: 'Clock Source',
	adatMirror: 'ADAT Mirror',
	inputOffset: 'Input Channel Offset',
	blinkMode: 'Blink Mode',
	clientUDP: 'UDP Clients',
	clientTCP: 'TCP Clients',
	sampleRate: 'Sample Rate',
	switchHeadroom: 'Switch Headroom',
	master: 'Master',
	heartBeat: 'Heart Beat',
	lwip: 'LWIP',
	dsp: 'DSP',
	tcpip: 'TCPIP',
	macRX: 'Mac RX',
	macTX: 'Mac TX',
	rtosHeapFree: 'RTOS Heap Free',
	mallocHeadFree: 'Malloc Heap Free',
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const variables: Partial<CompanionVariableDefinitions<VariablesSchema>> = {
		sceneCount: { name: 'Scene Count' },
		sceneActive: { name: 'Active Scene' },
		sceneActiveIndex: { name: 'Active Scene Index' },
		sceneActiveChanged: { name: 'Active Scene Changed' },
		isTalkingChannel: { name: 'Is Talking Channel' },
		isTalkingName: { name: 'Is Talking Name' },
	}
	for (const [id, name] of Object.entries(SYSTEM_NAMES) as [keyof SystemVariables, string][]) variables[id] = { name }
	// Every channel the protocol allows, whatever the count, so a variable on a button doesn't vanish when it changes
	for (let i = 1; i <= MAX_CHANNELS; i++) {
		variables[`channelName${i}`] = { name: `Channel ${i} Name` }
		variables[`channelWeight${i}`] = { name: `Channel ${i} Weight` }
		variables[`channelAmixGain${i}`] = { name: `Channel ${i} Gain Reduction` }
		variables[`channelInputLevel${i}`] = { name: `Channel ${i} Input Level` }
		variables[`channelOutputLevel${i}`] = { name: `Channel ${i} Output Level` }
	}
	for (const i of MATRICES) {
		variables[`matrixOutFader${i}`] = { name: `Matrix ${i} Fader` }
		variables[`matrixOutLevel${i}`] = { name: `Matrix ${i} Output Level` }
		for (let x = 1; x <= MATRIX_INPUTS; x++) {
			variables[`matrix${i}Xpoint${x}`] = { name: `Matrix ${i} Crosspoint ${x}` }
		}
	}
	for (const i of GROUPS) {
		variables[`groupNOM${i}`] = { name: `Group ${i} NOM Limit` }
		variables[`groupNOMpeak${i}`] = { name: `Group ${i} NOM Peak` }
		variables[`groupAD${i}`] = { name: `Group ${i} Automix Depth` }
		variables[`groupMST${i}`] = { name: `Group ${i} Music System Threshold` }
		variables[`groupMSTgain${i}`] = { name: `Group ${i} Music System Gain` }
	}
	// The loops fill every key, which the compiler can't follow through template literal keys. variables.spec.ts checks
	// these against every value written.
	self.setVariableDefinitions(variables as CompanionVariableDefinitions<VariablesSchema>)
}

const CLOCK_SOURCES = ['Dante/Madi', 'Word Clock', 'Internal', 'ADAT']
const ADAT_MIRRORS = ['0 Channels', '8 Channels', '16 Channels']

function clockSourceLabel(source: number, model: number | undefined): string {
	if (source > 0) return CLOCK_SOURCES[source] ?? String(source)
	if (source === 0 && model === MODEL_M) return 'Madi'
	if (source === 0 && model === MODEL_N) return 'Dante'
	return 'Unknown'
}

/** The system variables, from what the unit has reported of itself. The model is the configured one until it says */
export function systemValues(info: Partial<DeviceInfo>, model: number): SystemVariables {
	const or = <T>(value: T | undefined): T | Unknown => value ?? UNKNOWN
	return {
		deviceType: info.model === undefined ? UNKNOWN : (MODEL_NAMES[info.model] ?? String(info.model)),
		hostName: or(info.hostName),
		serialNumber: or(info.serialNumber),
		firmwareVersion: or(info.firmwareVersion),
		firmwareSecVersion: or(info.firmwareSecVersion),
		fpgaVersion: or(info.fpgaVersion),
		hardwareRevsion: or(info.hardwareRevision),
		macAddress: or(info.macAddress),
		ipAddress: or(info.ipAddress),
		netMask: or(info.netMask),
		gateway: or(info.gateway),
		dhcp: or(info.dhcp),
		channelCount: or(info.channelCount),
		linkGroup: or(info.linkGroup),
		clockSource: info.clockSource === undefined ? UNKNOWN : clockSourceLabel(info.clockSource, model),
		adatMirror: info.adatMirror === undefined ? UNKNOWN : (ADAT_MIRRORS[info.adatMirror] ?? String(info.adatMirror)),
		inputOffset: or(info.inputOffset),
		blinkMode: or(info.blinkMode),
		clientUDP: or(info.clientUDP),
		clientTCP: or(info.clientTCP),
		sampleRate: or(info.sampleRate),
		switchHeadroom: or(info.switchHeadroom),
		master: or(info.master),
		heartBeat: or(info.heartBeat),
		lwip: or(info.lwip),
		dsp: or(info.dsp),
		tcpip: or(info.tcpip),
		macRX: or(info.macRX),
		macTX: or(info.macTX),
		rtosHeapFree: or(info.rtosHeapFree),
		mallocHeadFree: or(info.mallocHeapFree),
	}
}

function sceneValues(state: DeviceState): SceneVariables {
	const { scenes } = state
	return {
		sceneCount: scenes.count ?? UNKNOWN,
		sceneActive: scenes.active ?? UNKNOWN,
		sceneActiveIndex: scenes.activeIndex ?? UNKNOWN,
		sceneActiveChanged: scenes.changed,
	}
}

/**
 * The channel with the least automix gain reduction, if it is at or above the threshold. A module feature, not the
 * unit's: it needs the meters polled.
 */
export function talkingValues(state: DeviceState, channelCount: number, threshold: number): TalkingVariables {
	let talker: number | undefined
	let loudest = -Infinity
	for (let channel = 1; channel <= channelCount; channel++) {
		const gain = state.channel(channel)?.automixGain
		if (gain !== undefined && gain > loudest) {
			loudest = gain
			talker = channel
		}
	}
	if (talker === undefined || loudest < threshold) return { isTalkingChannel: 0, isTalkingName: '' }
	return { isTalkingChannel: talker, isTalkingName: state.channel(talker)?.name ?? '' }
}

/** Every variable, for when the state has been replaced */
export function allValues(state: DeviceState, model: number, channelCount: number, threshold: number): Values {
	const values: Values = {
		...systemValues(state.info, model),
		...sceneValues(state),
		...talkingValues(state, channelCount, threshold),
	}
	for (const [channel, ch] of state.channels) {
		values[`channelName${channel}`] = ch.name
		values[`channelWeight${channel}`] = ch.weight
		values[`channelAmixGain${channel}`] = ch.automixGain
		values[`channelInputLevel${channel}`] = ch.inputPeak
		values[`channelOutputLevel${channel}`] = ch.outputPeak
	}
	for (const [group, g] of state.groups) {
		values[`groupNOM${group}`] = g.nomGainLimit
		values[`groupNOMpeak${group}`] = g.nomPeak
		values[`groupAD${group}`] = g.automixDepth
		values[`groupMST${group}`] = g.musicThreshold
		values[`groupMSTgain${group}`] = g.musicPeak
	}
	for (const [matrix, m] of state.matrices) {
		values[`matrixOutFader${matrix}`] = m.gain
		values[`matrixOutLevel${matrix}`] = m.outputPeak
		m.crosspoints.forEach((gain, i) => (values[`matrix${matrix}Xpoint${i + 1}`] = gain))
	}
	return values
}

/**
 * The variables some changes affect, with their new values. Whether the talking channel has moved is for the caller
 * to work out, as it depends on the config too.
 */
export function changedValues(state: DeviceState, changes: readonly Change[], model: number): Values {
	const values: Values = {}
	let infoChanged = false
	let sceneChanged = false
	for (const change of changes) {
		switch (change.kind) {
			case 'channel': {
				const ch = state.channel(change.channel)
				if (ch === undefined) break
				const n = change.channel
				if (change.field === 'name') values[`channelName${n}`] = ch.name
				else if (change.field === 'weight') values[`channelWeight${n}`] = ch.weight
				else if (change.field === 'automixGain') values[`channelAmixGain${n}`] = ch.automixGain
				else if (change.field === 'inputPeak') values[`channelInputLevel${n}`] = ch.inputPeak
				else if (change.field === 'outputPeak') values[`channelOutputLevel${n}`] = ch.outputPeak
				break
			}
			case 'group': {
				const g = state.group(change.group)
				if (g === undefined) break
				const n = change.group
				if (change.field === 'nomGainLimit') values[`groupNOM${n}`] = g.nomGainLimit
				else if (change.field === 'nomPeak') values[`groupNOMpeak${n}`] = g.nomPeak
				else if (change.field === 'automixDepth') values[`groupAD${n}`] = g.automixDepth
				else if (change.field === 'musicThreshold') values[`groupMST${n}`] = g.musicThreshold
				else if (change.field === 'musicPeak') values[`groupMSTgain${n}`] = g.musicPeak
				break
			}
			case 'matrix': {
				const m = state.matrix(change.matrix)
				if (m === undefined) break
				if (change.field === 'gain') values[`matrixOutFader${change.matrix}`] = m.gain
				else if (change.field === 'outputPeak') values[`matrixOutLevel${change.matrix}`] = m.outputPeak
				break
			}
			case 'crosspoint': {
				const gain = state.matrix(change.matrix)?.crosspoints[change.input - 1]
				if (gain !== undefined) values[`matrix${change.matrix}Xpoint${change.input}`] = gain
				break
			}
			case 'scene':
				sceneChanged = true
				break
			case 'info':
				infoChanged = true
				break
			case 'subscription':
				break
		}
	}
	if (sceneChanged) Object.assign(values, sceneValues(state))
	// Few and seldom changed, and the clock source label depends on the model, so they go together
	if (infoChanged) Object.assign(values, systemValues(state.info, model))
	return values
}
