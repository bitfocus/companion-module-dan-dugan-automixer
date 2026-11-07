import {
	Code,
	GROUPS,
	MATRICES,
	MATRIX_INPUTS,
	MAX_CHANNELS,
	MAX_MATRIX_OUTPUT,
	MAX_MUSIC_INPUT,
	MAX_NAME_LENGTH,
	NAME_FORBIDDEN,
	PARAM_SEP,
} from './consts.js'

/** What the reply to a command looks like, so the connection knows when it has come */
export interface ReplyMatch {
	/** The codes the reply may have. Usually just the command's own */
	readonly codes: readonly string[]
	/** The channel, group or matrix the reply is about, which it gives as its first parameter */
	readonly index?: number
}

export interface Command {
	/** The command as sent, less the EOM */
	readonly text: string
	readonly reply: ReplyMatch
}

/** Commands answered under another code as well as their own */
const REPLY_ALIASES: Partial<Record<Code, readonly Code[]>> = {
	[Code.GroupAutomixDepth]: [Code.GroupAutomixDepth, Code.GroupAutomixDepthAlt],
	[Code.GroupAutomixDepthAlt]: [Code.GroupAutomixDepthAlt, Code.GroupAutomixDepth],
	[Code.MeterSignalPresence]: [Code.MeterSignalPresence, Code.MeterSignalPresenceAlt],
	[Code.MeterSignalPresenceAlt]: [Code.MeterSignalPresenceAlt, Code.MeterSignalPresence],
	[Code.MeterSignalClip]: [Code.MeterSignalClip, Code.MeterSignalPresence],
}

export type ChannelCode =
	| Code.ChannelMode
	| Code.ChannelPreset
	| Code.ChannelBypass
	| Code.ChannelOverride
	| Code.ChannelWeight
	| Code.ChannelMusic
	| Code.ChannelNom
	| Code.ChannelGroup
export type GroupFlagCode = Code.GroupMute | Code.GroupPreset | Code.GroupOverride | Code.GroupLastHold
export type GroupCode =
	Code.GroupAutomixDepth | Code.GroupNomGainLimit | Code.GroupMusicThreshold | Code.GroupMusicInput
export type MatrixCode = Code.MatrixMute | Code.MatrixPolarity | Code.MatrixGain | Code.MatrixOutput
export type SceneNameCode = Code.SceneRecall | Code.SceneSave | Code.SceneDelete
export type NetworkCode = Code.IpAddress | Code.Netmask | Code.Gateway

export function isWhole(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export function isChannel(value: unknown): value is number {
	return isWhole(value, 1, MAX_CHANNELS)
}

export function isGroup(value: unknown): value is (typeof GROUPS)[number] {
	return GROUPS.includes(value as (typeof GROUPS)[number])
}

export function isMatrix(value: unknown): value is (typeof MATRICES)[number] {
	return MATRICES.includes(value as (typeof MATRICES)[number])
}

/**
 * @throws RangeError when the check fails. A command with a bad parameter is never sent
 */
function check<T>(value: T, valid: (value: unknown) => boolean, what: string): T {
	if (!valid(value)) throw new RangeError(`${String(value)} is not a valid ${what}`)
	return value
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

/** A level or weight to two decimal places at most, as the unit takes them: 2.5, not 2.50 or 2.5000000001 */
export function formatNumber(value: number): string {
	return String(Number(check(value, isFiniteNumber, 'number').toFixed(2)))
}

/**
 * A name as the unit can take it: up to the first character that would end a parameter or reply, and no longer than
 * {@link MAX_NAME_LENGTH}, as the 1.x module had it
 * @returns undefined if nothing is left
 */
export function safeName(name: string): string | undefined {
	const forbidden = NAME_FORBIDDEN.exec(name)
	const safe = (forbidden ? name.slice(0, forbidden.index) : name).slice(0, MAX_NAME_LENGTH)
	return safe.length > 0 ? safe : undefined
}

function requireName(name: string): string {
	const safe = safeName(name)
	if (safe === undefined) throw new RangeError(`"${name}" is not a valid name`)
	return safe
}

/** A command with no index to match its reply by */
export function command(code: Code, ...params: (string | number)[]): Command {
	return build(code, params)
}

function build(code: Code, params: readonly (string | number)[], index?: number): Command {
	const text = [code, ...params].join(PARAM_SEP)
	return { text, reply: { codes: REPLY_ALIASES[code] ?? [code], index } }
}

export function channelQuery(code: ChannelCode | Code.ChannelName, channel: number): Command {
	check(channel, isChannel, 'channel')
	return build(code, [channel], channel)
}

export function channelSet(code: ChannelCode, channel: number, value: number): Command {
	check(channel, isChannel, 'channel')
	return build(code, [channel, formatNumber(value)], channel)
}

export function channelName(channel: number, name: string): Command {
	check(channel, isChannel, 'channel')
	return build(Code.ChannelName, [channel, requireName(name)], channel)
}

/** Asks for the names of count channels from first. The reply's first parameter is first */
export function channelNames(first: number, count: number): Command {
	check(first, isChannel, 'channel')
	check(count, (value) => isWhole(value, 1, MAX_CHANNELS - first + 1), 'channel count')
	return build(Code.ChannelNameList, [first, count], first)
}

export function groupFlags(code: GroupFlagCode, mask?: number): Command {
	if (mask === undefined) return build(code, [])
	return build(code, [check(mask, (value) => isWhole(value, 0, 7), 'group mask')])
}

export function groupQuery(code: GroupCode, group: number): Command {
	check(group, isGroup, 'group')
	return build(code, [group], group)
}

export function groupSet(code: GroupCode, group: number, value: number): Command {
	check(group, isGroup, 'group')
	if (code === Code.GroupMusicInput) check(value, (v) => isWhole(v, 1, MAX_MUSIC_INPUT), 'music system input')
	return build(code, [group, formatNumber(value)], group)
}

export function matrixQuery(code: MatrixCode, matrix: number): Command {
	check(matrix, isMatrix, 'matrix')
	return build(code, [matrix], matrix)
}

export function matrixSet(code: MatrixCode, matrix: number, value: number): Command {
	check(matrix, isMatrix, 'matrix')
	if (code === Code.MatrixOutput) check(value, (v) => isWhole(v, 0, MAX_MATRIX_OUTPUT), 'matrix output')
	return build(code, [matrix, formatNumber(value)], matrix)
}

export function crosspointQuery(matrix: number, input: number): Command {
	check(matrix, isMatrix, 'matrix')
	check(input, (value) => isWhole(value, 1, MATRIX_INPUTS), 'matrix input')
	return build(Code.MatrixCrosspoint, [matrix, input], matrix)
}

export function crosspointSet(matrix: number, input: number, gain: number): Command {
	check(matrix, isMatrix, 'matrix')
	check(input, (value) => isWhole(value, 1, MATRIX_INPUTS), 'matrix input')
	return build(Code.MatrixCrosspoint, [matrix, input, formatNumber(gain)], matrix)
}

export function sceneNamed(code: SceneNameCode, name: string): Command {
	return build(code, [requireName(name)])
}

export function sceneRename(current: string, next: string): Command {
	return build(Code.SceneRename, [requireName(current), requireName(next)])
}

/** Asks for the names of count scenes from first */
export function sceneNames(first: number, count: number): Command {
	check(first, (value) => isWhole(value, 1, Number.MAX_SAFE_INTEGER), 'scene')
	check(count, (value) => isWhole(value, 1, Number.MAX_SAFE_INTEGER), 'scene count')
	return build(Code.SceneList, [first, count])
}

export function systemName(name: string): Command {
	return build(Code.SystemName, [requireName(name)])
}

/** Sets the unit's IP address, netmask or gateway, which takes effect on a reboot */
export function network(code: NetworkCode, address: string): Command {
	const parts = address.trim().split('.')
	const octets = parts.map(Number)
	if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part)) || !octets.every((o) => o <= 255)) {
		throw new RangeError(`${address} is not a valid IPv4 address`)
	}
	return build(code, octets)
}
