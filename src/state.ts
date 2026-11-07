import {
	GROUP_BITS,
	GROUPS,
	MATRICES,
	MATRIX_INPUTS,
	MAX_CHANNELS,
	type DeviceInfo,
	type GroupNumber,
	type MatrixNumber,
	type Reply,
} from './api/index.js'
import { unhandledOption } from './util.js'

/** A channel's mode and its preset, as the unit numbers them */
export enum ChannelMode {
	Manual = 0,
	Auto = 1,
	Mute = 2,
}

export interface ChannelState {
	mode: number
	preset: number
	bypass: boolean
	override: boolean
	/** dB */
	weight: number
	music: boolean
	nom: boolean
	group: number
	name: string
	/** dB, 0 when the channel is fully on */
	automixGain: number
	inputPeak: number
	outputPeak: number
	presence: boolean
	clip: boolean
}

export interface GroupState {
	mute: boolean
	preset: boolean
	override: boolean
	lastHold: boolean
	automixDepth: number
	nomGainLimit: number
	musicThreshold: number
	musicInput: number
	nomPeak: number
	musicPeak: number
}

export interface MatrixState {
	mute: boolean
	polarity: boolean
	gain: number
	output: number
	outputPeak: number
	/** By input, from input 1 at [0] */
	crosspoints: number[]
}

export interface SceneState {
	count: number | undefined
	active: string | undefined
	activeIndex: number | undefined
	/** Whether anything has been changed since the active scene was recalled */
	changed: boolean
	/** The scenes saved in the unit */
	names: string[]
}

/** Something about the unit that a reply has changed */
export type Change =
	| { kind: 'channel'; channel: number; field: keyof ChannelState }
	| { kind: 'group'; group: GroupNumber; field: keyof GroupState }
	| { kind: 'matrix'; matrix: MatrixNumber; field: Exclude<keyof MatrixState, 'crosspoints'> }
	| { kind: 'crosspoint'; matrix: MatrixNumber; input: number }
	| { kind: 'scene'; field: keyof SceneState }
	| { kind: 'info'; field: keyof DeviceInfo }
	| { kind: 'subscription' }

/** The crosspoint gain that means the input is off */
export const CROSSPOINT_OFF = -96
/** Meters start at the bottom of their range */
export const METER_FLOOR = -127.5

/*
 * The values the 1.x module started with, which are the unit's defaults where it has them. They stand until the unit
 * reports otherwise.
 */
function defaultChannel(channel: number): ChannelState {
	return {
		mode: ChannelMode.Auto,
		preset: ChannelMode.Auto,
		bypass: false,
		override: false,
		weight: 0,
		music: false,
		nom: false,
		group: 1,
		name: `Channel ${channel}`,
		automixGain: METER_FLOOR,
		inputPeak: METER_FLOOR,
		outputPeak: METER_FLOOR,
		presence: false,
		clip: false,
	}
}

function defaultGroup(): GroupState {
	return {
		mute: false,
		preset: false,
		override: false,
		lastHold: false,
		automixDepth: -15,
		nomGainLimit: 1,
		musicThreshold: -10,
		musicInput: 0,
		nomPeak: 0,
		musicPeak: 0,
	}
}

function defaultMatrix(): MatrixState {
	return {
		mute: false,
		polarity: false,
		gain: 0,
		output: 0,
		outputPeak: METER_FLOOR,
		crosspoints: Array.from({ length: MATRIX_INPUTS }, () => CROSSPOINT_OFF),
	}
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((value, i) => value === b[i])
}

/**
 * The state of the unit, as it has reported it: every channel the protocol allows, each group and each matrix, keyed
 * by the number the user sees. Changes only through {@link apply}, which says what each reply changed.
 */
export class DeviceState {
	readonly #channels = new Map<number, ChannelState>()
	readonly #groups = new Map<GroupNumber, GroupState>()
	readonly #matrices = new Map<MatrixNumber, MatrixState>()
	readonly scenes: SceneState = {
		count: undefined,
		active: undefined,
		activeIndex: undefined,
		changed: false,
		names: [],
	}
	readonly info: Partial<DeviceInfo> = {}
	/** The unsolicited message level, as the unit last reported it */
	subscription: number | undefined

	constructor() {
		for (let channel = 1; channel <= MAX_CHANNELS; channel++) this.#channels.set(channel, defaultChannel(channel))
		for (const group of GROUPS) this.#groups.set(group, defaultGroup())
		for (const matrix of MATRICES) this.#matrices.set(matrix, defaultMatrix())
	}

	get channels(): ReadonlyMap<number, Readonly<ChannelState>> {
		return this.#channels
	}

	get groups(): ReadonlyMap<GroupNumber, Readonly<GroupState>> {
		return this.#groups
	}

	get matrices(): ReadonlyMap<MatrixNumber, Readonly<MatrixState>> {
		return this.#matrices
	}

	channel(channel: number): Readonly<ChannelState> | undefined {
		return this.#channels.get(channel)
	}

	group(group: number): Readonly<GroupState> | undefined {
		return this.#groups.get(group as GroupNumber)
	}

	matrix(matrix: number): Readonly<MatrixState> | undefined {
		return this.#matrices.get(matrix as MatrixNumber)
	}

	/**
	 * Takes in a reply from the unit
	 * @returns what it changed, which is nothing if it repeated what was known
	 */
	apply(reply: Reply): Change[] {
		const changes: Change[] = []
		const setChannel = <K extends keyof ChannelState>(channel: number, field: K, value: ChannelState[K]) => {
			const state = this.#channels.get(channel)
			if (state === undefined || state[field] === value) return
			state[field] = value
			changes.push({ kind: 'channel', channel, field })
		}
		const setGroup = <K extends keyof GroupState>(group: GroupNumber, field: K, value: GroupState[K]) => {
			const state = this.#groups.get(group)
			if (state === undefined || state[field] === value) return
			state[field] = value
			changes.push({ kind: 'group', group, field })
		}
		const setMatrix = <K extends Exclude<keyof MatrixState, 'crosspoints'>>(
			matrix: MatrixNumber,
			field: K,
			value: MatrixState[K],
		) => {
			const state = this.#matrices.get(matrix)
			if (state === undefined || state[field] === value) return
			state[field] = value
			changes.push({ kind: 'matrix', matrix, field })
		}
		const setCrosspoint = (matrix: MatrixNumber, input: number, gain: number) => {
			const state = this.#matrices.get(matrix)
			if (state === undefined || input < 1 || input > MATRIX_INPUTS || state.crosspoints[input - 1] === gain) return
			state.crosspoints[input - 1] = gain
			changes.push({ kind: 'crosspoint', matrix, input })
		}
		const setScene = <K extends keyof SceneState>(field: K, value: SceneState[K]) => {
			const current = this.scenes[field]
			const same = Array.isArray(current) && Array.isArray(value) ? sameList(current, value) : current === value
			if (same) return
			this.scenes[field] = value
			changes.push({ kind: 'scene', field })
		}
		const setInfo = (info: Partial<DeviceInfo>) => {
			for (const key of Object.keys(info) as (keyof DeviceInfo)[]) {
				if (info[key] === undefined || this.info[key] === info[key]) continue
				Object.assign(this.info, { [key]: info[key] })
				changes.push({ kind: 'info', field: key })
			}
		}
		/** values[0] is channel, group or matrix 1 */
		const each = <T>(values: readonly T[], set: (index: number, value: T) => void) =>
			values.forEach((value, i) => set(i + 1, value))

		switch (reply.type) {
			case 'channel': {
				const { channel, field, value } = reply
				switch (field) {
					case 'mode':
					case 'preset':
					case 'weight':
					case 'group':
						setChannel(channel, field, value)
						break
					case 'bypass':
					case 'override':
					case 'music':
					case 'nom':
						setChannel(channel, field, value !== 0)
						break
					default:
						unhandledOption(field, undefined)
				}
				break
			}
			case 'channelName':
				setChannel(reply.channel, 'name', reply.name)
				break
			case 'channelNames':
				reply.names.forEach((name, i) => setChannel(reply.first + i, 'name', name))
				break
			case 'groupFlags':
				for (const group of GROUPS) setGroup(group, reply.flag, (reply.mask & GROUP_BITS[group]) !== 0)
				break
			case 'group':
				setGroup(reply.group, reply.field, reply.value)
				break
			case 'matrix': {
				const { matrix, field, value } = reply
				if (field === 'mute' || field === 'polarity') setMatrix(matrix, field, value !== 0)
				else setMatrix(matrix, field, value)
				break
			}
			case 'crosspoint':
				setCrosspoint(reply.matrix, reply.input, reply.gain)
				break
			case 'channelMeters':
				each(reply.values, (channel, value) => setChannel(channel, reply.meter, value))
				break
			case 'groupMeters':
				each(reply.values, (group, value) => setGroup(group as GroupNumber, reply.meter, value))
				break
			case 'matrixMeters':
				each(reply.values, (matrix, value) => setMatrix(matrix as MatrixNumber, 'outputPeak', value))
				break
			case 'channelFlags':
				each(reply.values, (channel, value) => setChannel(channel, reply.flag, value))
				break
			case 'meterStatus': {
				const { status } = reply
				each(status.presence, (channel, value) => setChannel(channel, 'presence', value))
				each(status.clip, (channel, value) => setChannel(channel, 'clip', value))
				each(status.automixGain, (channel, value) => setChannel(channel, 'automixGain', value))
				each(status.inputPeak, (channel, value) => setChannel(channel, 'inputPeak', value))
				each(status.outputPeak, (channel, value) => setChannel(channel, 'outputPeak', value))
				each(status.nomPeak, (group, value) => setGroup(group as GroupNumber, 'nomPeak', value))
				each(status.musicPeak, (group, value) => setGroup(group as GroupNumber, 'musicPeak', value))
				each(status.matrixPeak, (matrix, value) => setMatrix(matrix as MatrixNumber, 'outputPeak', value))
				break
			}
			case 'channelBulk': {
				const { bulk } = reply
				each(bulk.modes, (channel, value) => setChannel(channel, 'mode', value))
				each(bulk.presets, (channel, value) => setChannel(channel, 'preset', value))
				each(bulk.bypass, (channel, value) => setChannel(channel, 'bypass', value))
				each(bulk.override, (channel, value) => setChannel(channel, 'override', value))
				each(bulk.music, (channel, value) => setChannel(channel, 'music', value))
				each(bulk.nom, (channel, value) => setChannel(channel, 'nom', value))
				each(bulk.groups, (channel, value) => setChannel(channel, 'group', value))
				setInfo({ channelCount: bulk.channelCount })
				break
			}
			case 'matrixBulk':
				reply.bulk.crosspoints.forEach((gains, m) =>
					each(gains, (input, gain) => setCrosspoint((m + 1) as MatrixNumber, input, gain)),
				)
				each(reply.bulk.gains, (matrix, value) => setMatrix(matrix as MatrixNumber, 'gain', value))
				break
			case 'sceneCount':
				setScene('count', reply.count)
				break
			case 'sceneActive':
				setScene('active', reply.name)
				setScene('activeIndex', reply.index)
				setScene('changed', reply.changed)
				break
			case 'sceneList':
				setScene('names', reply.names)
				break
			case 'subscribe':
				if (this.subscription !== reply.level) {
					this.subscription = reply.level
					changes.push({ kind: 'subscription' })
				}
				break
			case 'info':
				setInfo(reply.info)
				break
			case 'scene':
			case 'error':
			case 'notice':
			case 'unexpected':
				break
			default:
				unhandledOption(reply, undefined)
		}
		return changes
	}
}
