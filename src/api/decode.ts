import {
	Code,
	ERROR_PREFIX,
	GROUPS,
	MATRICES,
	MATRIX_INPUTS,
	MAX_CHANNELS,
	PARAM_SEP,
	SOM,
	type BinaryCode,
	type GroupNumber,
	type MatrixNumber,
} from './consts.js'
import { isChannel, isGroup, isMatrix, isWhole } from './messages.js'

export type ChannelField = 'mode' | 'preset' | 'bypass' | 'override' | 'weight' | 'music' | 'nom' | 'group'
export type GroupFlag = 'mute' | 'preset' | 'override' | 'lastHold'
export type GroupField = 'automixDepth' | 'nomGainLimit' | 'musicThreshold' | 'musicInput'
export type MatrixField = 'mute' | 'polarity' | 'gain' | 'output'
export type ChannelMeter = 'automixGain' | 'inputPeak' | 'outputPeak'
export type GroupMeter = 'nomPeak' | 'musicPeak'
export type ChannelFlag = 'presence' | 'clip'
export type SceneEvent =
	'recalled' | 'saved' | 'savedNew' | 'renamed' | 'deleted' | 'channelDefaults' | 'matrixDefaults'

/** What the unit reports about itself. Each reply gives some of it */
export interface DeviceInfo {
	/** The number {@link MODEL_NAMES} is keyed by */
	model: number
	hostName: string
	serialNumber: string
	firmwareVersion: string
	firmwareSecVersion: string
	fpgaVersion: string
	hardwareRevision: string
	macAddress: string
	ipAddress: string
	netMask: string
	gateway: string
	dhcp: boolean
	channelCount: number
	linkGroup: number
	clockSource: number
	adatMirror: number
	inputOffset: number
	blinkMode: boolean
	clientUDP: number
	clientTCP: number
	/** As the unit has it: 48kHz, 96kHz, or what it said if neither */
	sampleRate: string
	switchHeadroom: number
	master: boolean
	heartBeat: number
	lwip: number
	dsp: number
	tcpip: number
	macRX: number
	macTX: number
	rtosHeapFree: number
	mallocHeapFree: number
}

/** The binary GS reply. Each array is indexed from 0, so channel 1 is [0] */
export interface MeterStatus {
	presence: boolean[]
	clip: boolean[]
	automixGain: number[]
	inputPeak: number[]
	outputPeak: number[]
	nomPeak: number[]
	musicPeak: number[]
	matrixPeak: number[]
}

/** The binary GP reply, indexed as {@link MeterStatus} */
export interface ChannelBulk {
	modes: number[]
	channelCount: number
	bypass: boolean[]
	nom: boolean[]
	music: boolean[]
	override: boolean[]
	groups: number[]
	presets: number[]
}

/** The binary GM reply. crosspoints[0][0] is matrix 1, input 1 */
export interface MatrixBulk {
	crosspoints: number[][]
	gains: number[]
}

export type Reply =
	| { type: 'channel'; field: ChannelField; channel: number; value: number }
	| { type: 'channelName'; channel: number; name: string }
	| { type: 'channelNames'; first: number; names: string[] }
	| { type: 'groupFlags'; flag: GroupFlag; mask: number }
	| { type: 'group'; field: GroupField; group: GroupNumber; value: number }
	| { type: 'matrix'; field: MatrixField; matrix: MatrixNumber; value: number }
	| { type: 'crosspoint'; matrix: MatrixNumber; input: number; gain: number }
	/** One value per channel, from channel 1 */
	| { type: 'channelMeters'; meter: ChannelMeter; values: number[] }
	| { type: 'groupMeters'; meter: GroupMeter; values: number[] }
	| { type: 'matrixMeters'; values: number[] }
	| { type: 'channelFlags'; flag: ChannelFlag; values: boolean[] }
	| { type: 'meterStatus'; status: MeterStatus }
	| { type: 'channelBulk'; bulk: ChannelBulk }
	| { type: 'matrixBulk'; bulk: MatrixBulk }
	| { type: 'sceneCount'; count: number }
	| { type: 'sceneActive'; name: string; index: number; changed: boolean }
	| { type: 'sceneList'; names: string[] }
	/** A scene saved, recalled, renamed or deleted, or the defaults recalled. names are the scene names it gave */
	| { type: 'scene'; event: SceneEvent; names: string[] }
	| { type: 'subscribe'; level: number }
	| { type: 'info'; info: Partial<DeviceInfo> }
	/** The unit could not carry out a command */
	| { type: 'error'; code: string; message: string }
	/** A reply that is only logged */
	| { type: 'notice'; code: string; message: string }
	/** A reply this module doesn't know, or one it does with parameters it can't make sense of */
	| { type: 'unexpected'; reason: string }

/** A text reply split into its code and parameters */
export interface RawReply {
	code: string
	params: string[]
}

/**
 * @param text a reply from its SOM, as the reader gives it
 */
export function splitReply(text: string): RawReply {
	const body = text.startsWith(SOM) ? text.slice(SOM.length) : text
	const [code, ...params] = body.split(PARAM_SEP)
	return { code: code.trim(), params }
}

/** Levels in most meters: each step is half a dB down from 0 */
export function levelFromByte(byte: number): number {
	// Not -byte / 2, which makes 0 into -0
	return 0 - byte / 2
}

/** Crosspoint and matrix gains: 192 is 0 dB, and each step half a dB */
export function gainFromByte(byte: number): number {
	return (byte - 192) / 2
}

/** count bytes from offset as 8 flags each, bit 0 of the first byte first */
function bitFlags(data: Buffer, offset: number, count: number): boolean[] {
	const flags: boolean[] = []
	for (let i = 0; i < count; i++) {
		const byte = data[offset + i]
		for (let bit = 0; bit < 8; bit++) flags.push((byte & (1 << bit)) !== 0)
	}
	return flags
}

/** count bytes from offset as 4 two-bit values each, bits 0 and 1 of the first byte first */
function bitPairs(data: Buffer, offset: number, count: number): number[] {
	const values: number[] = []
	for (let i = 0; i < count; i++) {
		const byte = data[offset + i]
		for (let pair = 0; pair < 4; pair++) values.push((byte >> (pair * 2)) & 0b11)
	}
	return values
}

function bytes(data: Buffer, offset: number, count: number, map: (byte: number) => number): number[] {
	return Array.from(data.subarray(offset, offset + count), map)
}

/*
 * Offsets into the binary replies, header included, as the 1.x module read them. The bytes between are unknown: the GS
 * byte at 20 may be a reclip flag, and GM may have the matrix output patch after the gains.
 */
const GS = {
	presence: 4,
	clip: 12,
	automixGain: 21,
	nomPeak: 85,
	inputPeak: 91,
	outputPeak: 155,
	musicPeak: 221,
	matrixPeak: 227,
}
const GP = { modes: 4, channelCount: 68, bypass: 69, nom: 77, music: 85, override: 93, groups: 101, presets: 117 }
const GM = { crosspoints: 4, gains: 880 }

const FLAG_BYTES = MAX_CHANNELS / 8
const PAIR_BYTES = MAX_CHANNELS / 4

export function decodeMeterStatus(data: Buffer): MeterStatus {
	return {
		presence: bitFlags(data, GS.presence, FLAG_BYTES),
		clip: bitFlags(data, GS.clip, FLAG_BYTES),
		automixGain: bytes(data, GS.automixGain, MAX_CHANNELS, levelFromByte),
		inputPeak: bytes(data, GS.inputPeak, MAX_CHANNELS, levelFromByte),
		outputPeak: bytes(data, GS.outputPeak, MAX_CHANNELS, levelFromByte),
		nomPeak: bytes(data, GS.nomPeak, GROUPS.length, levelFromByte),
		musicPeak: bytes(data, GS.musicPeak, GROUPS.length, levelFromByte),
		matrixPeak: bytes(data, GS.matrixPeak, MATRICES.length, levelFromByte),
	}
}

export function decodeChannelBulk(data: Buffer): ChannelBulk {
	return {
		modes: bytes(data, GP.modes, MAX_CHANNELS, (byte) => byte),
		channelCount: data[GP.channelCount],
		bypass: bitFlags(data, GP.bypass, FLAG_BYTES),
		nom: bitFlags(data, GP.nom, FLAG_BYTES),
		music: bitFlags(data, GP.music, FLAG_BYTES),
		override: bitFlags(data, GP.override, FLAG_BYTES),
		groups: bitPairs(data, GP.groups, PAIR_BYTES),
		presets: bitPairs(data, GP.presets, PAIR_BYTES),
	}
}

export function decodeMatrixBulk(data: Buffer): MatrixBulk {
	return {
		crosspoints: MATRICES.map((_, m) => bytes(data, GM.crosspoints + m * MATRIX_INPUTS, MATRIX_INPUTS, gainFromByte)),
		gains: bytes(data, GM.gains, MATRICES.length, gainFromByte),
	}
}

export function decodeBinary(code: BinaryCode, data: Buffer): Reply {
	switch (code) {
		case Code.MeterStatus:
			return { type: 'meterStatus', status: decodeMeterStatus(data) }
		case Code.ChannelBulk:
			return { type: 'channelBulk', bulk: decodeChannelBulk(data) }
		case Code.MatrixBulk:
			return { type: 'matrixBulk', bulk: decodeMatrixBulk(data) }
	}
}

/** A parameter as a number, if it is one. Lenient as Number() is, as the 1.x module was */
function num(param: string | undefined): number | undefined {
	if (param === undefined || param.trim() === '') return undefined
	const value = Number(param)
	return Number.isFinite(value) ? value : undefined
}

function int(param: string | undefined): number | undefined {
	const value = num(param)
	return value !== undefined && Number.isInteger(value) ? value : undefined
}

/** Decodes a reply's parameters, or says why it can't */
type Decoder = (params: string[]) => Reply | string

function expectCount(params: string[], count: number): string | undefined {
	return params.length === count ? undefined : `expected ${count} parameters, not ${params.length}`
}

function channelValue(field: ChannelField): Decoder {
	return (params) => {
		const wrong = expectCount(params, 2)
		if (wrong) return wrong
		const channel = int(params[0])
		const value = num(params[1])
		if (!isChannel(channel)) return `no channel ${params[0]}`
		if (value === undefined) return `${params[1]} is not a number`
		return { type: 'channel', field, channel, value }
	}
}

function groupFlags(flag: GroupFlag): Decoder {
	return (params) => {
		const wrong = expectCount(params, 1)
		if (wrong) return wrong
		const mask = int(params[0])
		if (!isWhole(mask, 0, 7)) return `${params[0]} is not a group mask`
		return { type: 'groupFlags', flag, mask }
	}
}

function groupValue(field: GroupField): Decoder {
	return (params) => {
		const wrong = expectCount(params, 2)
		if (wrong) return wrong
		const group = int(params[0])
		const value = num(params[1])
		if (!isGroup(group)) return `no group ${params[0]}`
		if (value === undefined) return `${params[1]} is not a number`
		return { type: 'group', field, group, value }
	}
}

function matrixValue(field: MatrixField): Decoder {
	return (params) => {
		const wrong = expectCount(params, 2)
		if (wrong) return wrong
		const matrix = int(params[0])
		const value = num(params[1])
		if (!isMatrix(matrix)) return `no matrix ${params[0]}`
		if (value === undefined) return `${params[1]} is not a number`
		return { type: 'matrix', field, matrix, value }
	}
}

/** count meter readings, each a byte in decimal */
function meterBytes(params: string[], count: number): number[] | string {
	const wrong = expectCount(params, count)
	if (wrong) return wrong
	const values = params.map(int)
	if (!values.every((value) => isWhole(value, 0, 255))) return 'readings are not all bytes'
	return values.map(levelFromByte)
}

function channelMeter(meter: ChannelMeter): Decoder {
	return (params) => {
		const values = meterBytes(params, MAX_CHANNELS)
		return typeof values === 'string' ? values : { type: 'channelMeters', meter, values }
	}
}

function groupMeter(meter: GroupMeter): Decoder {
	return (params) => {
		const values = meterBytes(params, GROUPS.length)
		return typeof values === 'string' ? values : { type: 'groupMeters', meter, values }
	}
}

/** Eight bytes in hex, eight channels to a byte */
function channelFlags(flag: ChannelFlag): Decoder {
	return (params) => {
		const wrong = expectCount(params, FLAG_BYTES)
		if (wrong) return wrong
		if (!params.every((param) => /^[0-9a-f]{1,2}$/i.test(param.trim()))) return 'flags are not all hex bytes'
		const data = Buffer.from(params.map((param) => parseInt(param, 16)))
		return { type: 'channelFlags', flag, values: bitFlags(data, 0, FLAG_BYTES) }
	}
}

function sceneEvent(event: SceneEvent, count?: number): Decoder {
	return (params) => {
		const wrong = count === undefined ? undefined : expectCount(params, count)
		return wrong ?? { type: 'scene', event, names: params }
	}
}

function info<K extends keyof DeviceInfo>(key: K, parse: (param: string) => DeviceInfo[K] | undefined): Decoder {
	return (params) => {
		const wrong = expectCount(params, 1)
		if (wrong) return wrong
		const value = parse(params[0])
		if (value === undefined) return `${params[0]} is not a valid ${key}`
		return { type: 'info', info: { [key]: value } }
	}
}

const flag = (param: string): boolean => param.trim() === '1'

/** Four octets, as the unit gives its addresses */
function address(key: 'ipAddress' | 'netMask' | 'gateway'): Decoder {
	return (params) => {
		const wrong = expectCount(params, 4)
		if (wrong) return wrong
		if (!params.every((param) => isWhole(int(param), 0, 255))) return 'octets are not all bytes'
		return { type: 'info', info: { [key]: params.map((param) => param.trim()).join('.') } }
	}
}

/** A parameter like UDP:2, as the client connection and resource replies give them */
function labelled(param: string | undefined): number | undefined {
	return num(param?.split(':')[1])
}

const SAMPLE_RATES: Readonly<Record<string, string>> = { '0': '48kHz', '1': '96kHz' }

const DECODERS: Readonly<Partial<Record<string, Decoder>>> = {
	[Code.ChannelMode]: channelValue('mode'),
	[Code.ChannelPreset]: channelValue('preset'),
	[Code.ChannelBypass]: channelValue('bypass'),
	[Code.ChannelOverride]: channelValue('override'),
	[Code.ChannelWeight]: channelValue('weight'),
	[Code.ChannelMusic]: channelValue('music'),
	[Code.ChannelNom]: channelValue('nom'),
	[Code.ChannelGroup]: channelValue('group'),
	[Code.ChannelName]: (params) => {
		const wrong = expectCount(params, 2)
		if (wrong) return wrong
		const channel = int(params[0])
		if (!isChannel(channel)) return `no channel ${params[0]}`
		return { type: 'channelName', channel, name: params[1] }
	},
	[Code.ChannelNameList]: (params) => {
		const first = int(params[0])
		const count = int(params[1])
		if (!isChannel(first) || !isWhole(count, 1, MAX_CHANNELS - first + 1)) return 'no channels to name'
		const wrong = expectCount(params, 2 + count)
		return wrong ?? { type: 'channelNames', first, names: params.slice(2) }
	},

	[Code.GroupMute]: groupFlags('mute'),
	[Code.GroupPreset]: groupFlags('preset'),
	[Code.GroupOverride]: groupFlags('override'),
	[Code.GroupLastHold]: groupFlags('lastHold'),
	[Code.GroupAutomixDepth]: groupValue('automixDepth'),
	[Code.GroupAutomixDepthAlt]: groupValue('automixDepth'),
	[Code.GroupNomGainLimit]: groupValue('nomGainLimit'),
	[Code.GroupMusicThreshold]: groupValue('musicThreshold'),
	[Code.GroupMusicInput]: groupValue('musicInput'),

	[Code.MatrixMute]: matrixValue('mute'),
	[Code.MatrixPolarity]: matrixValue('polarity'),
	[Code.MatrixGain]: matrixValue('gain'),
	[Code.MatrixOutput]: matrixValue('output'),
	[Code.MatrixCrosspoint]: (params) => {
		const wrong = expectCount(params, 3)
		if (wrong) return wrong
		const matrix = int(params[0])
		const input = int(params[1])
		const gain = num(params[2])
		if (!isMatrix(matrix)) return `no matrix ${params[0]}`
		if (!isWhole(input, 1, MATRIX_INPUTS)) return `no matrix input ${params[1]}`
		if (gain === undefined) return `${params[2]} is not a number`
		return { type: 'crosspoint', matrix, input, gain }
	},
	[Code.MatrixDefaults]: sceneEvent('matrixDefaults'),

	[Code.MeterAutomixGain]: channelMeter('automixGain'),
	[Code.MeterInputPeaks]: channelMeter('inputPeak'),
	[Code.MeterOutputPeaks]: channelMeter('outputPeak'),
	[Code.MeterNomGain]: groupMeter('nomPeak'),
	[Code.MeterMusicReference]: groupMeter('musicPeak'),
	[Code.MeterMatrixOutput]: (params) => {
		const values = meterBytes(params, MATRICES.length)
		return typeof values === 'string' ? values : { type: 'matrixMeters', values }
	},
	[Code.MeterSignalPresence]: channelFlags('presence'),
	[Code.MeterSignalPresenceAlt]: channelFlags('presence'),
	[Code.MeterSignalClip]: channelFlags('clip'),

	[Code.SceneCount]: (params) => {
		const wrong = expectCount(params, 1)
		if (wrong) return wrong
		const count = int(params[0])
		if (!isWhole(count, 0, Number.MAX_SAFE_INTEGER)) return `${params[0]} is not a scene count`
		return { type: 'sceneCount', count }
	},
	[Code.SceneActive]: (params) => {
		const wrong = expectCount(params, 3)
		if (wrong) return wrong
		const index = int(params[1])
		if (index === undefined) return `${params[1]} is not a scene index`
		return { type: 'sceneActive', name: params[0], index, changed: flag(params[2]) }
	},
	// The first three parameters come before the names. Probably the first, the count and the total, but only the
	// names were ever used
	[Code.SceneList]: (params) =>
		params.length < 3 ? 'expected at least 3 parameters' : { type: 'sceneList', names: params.slice(3) },
	[Code.SceneRecall]: sceneEvent('recalled', 1),
	[Code.SceneSave]: sceneEvent('saved', 1),
	[Code.SceneSaveNew]: sceneEvent('savedNew', 1),
	[Code.SceneDelete]: sceneEvent('deleted', 1),
	[Code.SceneRename]: sceneEvent('renamed', 2),
	[Code.ChannelDefaults]: sceneEvent('channelDefaults'),

	[Code.Subscribe]: (params) => {
		const wrong = expectCount(params, 1)
		if (wrong) return wrong
		const level = int(params[0])
		if (!isWhole(level, 0, 2)) return `${params[0]} is not a subscription level`
		return { type: 'subscribe', level }
	},
	[Code.LinkGroup]: info('linkGroup', int),
	[Code.ClockSource]: info('clockSource', int),
	[Code.AdatMirror]: info('adatMirror', int),
	[Code.AutomixChannels]: info('channelCount', int),
	[Code.ChannelOffset]: info('inputOffset', int),
	[Code.BlinkMode]: info('blinkMode', flag),
	[Code.Dhcp]: info('dhcp', flag),
	[Code.Master]: info('master', flag),
	[Code.SystemName]: info('hostName', (param) => param),
	[Code.SwitchHeadroom]: info('switchHeadroom', num),
	[Code.SampleRate]: info('sampleRate', (param) => SAMPLE_RATES[param.trim()] ?? param),
	[Code.IpAddress]: address('ipAddress'),
	[Code.Netmask]: address('netMask'),
	[Code.Gateway]: address('gateway'),
	[Code.SystemConfig]: (params) => {
		const wrong = expectCount(params, 12)
		if (wrong) return wrong
		const [model, hostName, serialNumber, firmwareVersion, fpgaVersion, hardwareRevision, macAddress] = params
		const [ipAddress, netMask, gateway, dhcp, channelCount] = params.slice(7)
		const modelNumber = int(model)
		const channels = int(channelCount)
		if (modelNumber === undefined) return `${model} is not a model number`
		if (!isWhole(channels, 1, MAX_CHANNELS)) return `${channelCount} is not a channel count`
		return {
			type: 'info',
			info: {
				model: modelNumber,
				hostName,
				serialNumber,
				firmwareVersion,
				fpgaVersion,
				hardwareRevision,
				macAddress,
				ipAddress,
				netMask,
				gateway,
				dhcp: flag(dhcp),
				channelCount: channels,
			},
		}
	},
	[Code.Firmware]: (params) => {
		const wrong = expectCount(params, 4)
		if (wrong) return wrong
		const [firmwareVersion, firmwareSecVersion, fpgaVersion, hardwareRevision] = params
		return { type: 'info', info: { firmwareVersion, firmwareSecVersion, fpgaVersion, hardwareRevision } }
	},
	[Code.Connections]: (params) => {
		const wrong = expectCount(params, 2)
		if (wrong) return wrong
		const clientUDP = labelled(params[0])
		const clientTCP = labelled(params[1])
		if (clientUDP === undefined || clientTCP === undefined) return 'client counts are not numbers'
		return { type: 'info', info: { clientUDP, clientTCP } }
	},
	[Code.Resources]: (params) => {
		const wrong = expectCount(params, 8)
		if (wrong) return wrong
		const values = params.map(labelled)
		if (!values.every((value) => value !== undefined)) return 'resource figures are not all numbers'
		const [heartBeat, lwip, dsp, tcpip, macRX, macTX, rtosHeapFree, mallocHeapFree] = values
		return {
			type: 'info',
			info: { heartBeat, lwip, dsp, tcpip, macRX, macTX, rtosHeapFree, mallocHeapFree },
		}
	},
	[Code.Ping]: (params) => ({ type: 'notice', code: Code.Ping, message: `Ping received: ${params.join(PARAM_SEP)}` }),
	[Code.Pd]: (params) => ({ type: 'notice', code: Code.Pd, message: `PD received: ${params.join(PARAM_SEP)}` }),
}

/**
 * Makes sense of a text reply
 * @param text a reply from its SOM, as the reader gives it
 */
export function decodeText(text: string): Reply {
	const { code, params } = splitReply(text)
	if (params.length > 0 && ERROR_PREFIX.test(params[0].trim())) {
		return { type: 'error', code, message: params.join(PARAM_SEP) }
	}
	const decoder = DECODERS[code]
	if (decoder === undefined) return { type: 'unexpected', reason: `unknown reply ${code}` }
	const reply = decoder(params)
	return typeof reply === 'string' ? { type: 'unexpected', reason: `${code}: ${reply}` } : reply
}
