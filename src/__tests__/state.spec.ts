import { describe, expect, it } from 'vitest'
import { DeviceState, CROSSPOINT_OFF, METER_FLOOR } from '../state.js'
import { decodeBinary, decodeText } from '../api/decode.js'
import { Code } from '../api/consts.js'
import { channelBulkBlock, matrixBulkBlock, meterStatusBlock } from './fixtures.js'

describe('DeviceState', () => {
	it('holds every channel, group and matrix from the start, keyed by number', () => {
		const state = new DeviceState()
		expect([...state.channels.keys()]).toEqual(Array.from({ length: 64 }, (_, i) => i + 1))
		expect([...state.groups.keys()]).toEqual([1, 2, 3])
		expect([...state.matrices.keys()]).toEqual([1, 2, 3, 4, 5, 6])
		expect(state.channel(5)).toMatchObject({ name: 'Channel 5', mode: 1, automixGain: METER_FLOOR })
		expect(state.matrix(1)?.crosspoints).toHaveLength(144)
		expect(state.matrix(1)?.crosspoints.every((gain) => gain === CROSSPOINT_OFF)).toBe(true)
		expect(state.channel(65)).toBeUndefined()
		expect(state.group(0)).toBeUndefined()
	})

	it('says what a reply changed, and nothing if it repeats what is known', () => {
		const state = new DeviceState()
		expect(state.apply(decodeText('*CW,3,-6'))).toEqual([{ kind: 'channel', channel: 3, field: 'weight' }])
		expect(state.channel(3)?.weight).toBe(-6)
		expect(state.apply(decodeText('*CW,3,-6'))).toEqual([])
	})

	it('holds on/off settings as booleans', () => {
		const state = new DeviceState()
		state.apply(decodeText('*BP,2,1'))
		state.apply(decodeText('*MXP,4,1'))
		expect(state.channel(2)?.bypass).toBe(true)
		expect(state.matrix(4)?.polarity).toBe(true)
		state.apply(decodeText('*BP,2,0'))
		expect(state.channel(2)?.bypass).toBe(false)
	})

	it('splits a group mask between the groups', () => {
		const state = new DeviceState()
		expect(state.apply(decodeText('*SM,5'))).toEqual([
			{ kind: 'group', group: 1, field: 'mute' },
			{ kind: 'group', group: 3, field: 'mute' },
		])
		expect([1, 2, 3].map((group) => state.group(group)?.mute)).toEqual([true, false, true])
	})

	it('takes in every meter of a GS reply', () => {
		const state = new DeviceState()
		const changes = state.apply(
			decodeBinary(Code.MeterStatus, meterStatusBlock({ presence: [7], automixGain: { 7: 2 }, matrixPeak: { 2: 6 } })),
		)
		expect(state.channel(7)).toMatchObject({ presence: true, automixGain: -1, inputPeak: METER_FLOOR })
		expect(state.matrix(2)?.outputPeak).toBe(-3)
		expect(changes).toContainEqual({ kind: 'channel', channel: 7, field: 'presence' })
		expect(changes).toContainEqual({ kind: 'matrix', matrix: 2, field: 'outputPeak' })
		// A second identical reply changes nothing
		expect(
			state.apply(
				decodeBinary(
					Code.MeterStatus,
					meterStatusBlock({ presence: [7], automixGain: { 7: 2 }, matrixPeak: { 2: 6 } }),
				),
			),
		).toEqual([])
	})

	it('takes the channel count from a GP reply', () => {
		const state = new DeviceState()
		state.apply(decodeBinary(Code.ChannelBulk, channelBulkBlock({ channelCount: 24, modes: { 1: 2 }, bypass: [1] })))
		expect(state.info.channelCount).toBe(24)
		expect(state.channel(1)).toMatchObject({ mode: 2, bypass: true })
	})

	it('takes the crosspoints and gains from a GM reply', () => {
		const state = new DeviceState()
		const changes = state.apply(
			decodeBinary(Code.MatrixBulk, matrixBulkBlock({ crosspoints: { '3:10': 192 }, gains: { 3: 172 } })),
		)
		expect(state.matrix(3)?.crosspoints[9]).toBe(0)
		expect(state.matrix(3)?.gain).toBe(-10)
		expect(changes).toEqual([
			{ kind: 'crosspoint', matrix: 3, input: 10 },
			{ kind: 'matrix', matrix: 3, field: 'gain' },
		])
	})

	it('names a block of channels', () => {
		const state = new DeviceState()
		state.apply(decodeText('*CNS,9,2,Alto,Tenor'))
		expect([state.channel(9)?.name, state.channel(10)?.name]).toEqual(['Alto', 'Tenor'])
	})

	it('compares scene lists by content', () => {
		const state = new DeviceState()
		expect(state.apply(decodeText('*SNL,1,2,2,A,B'))).toEqual([{ kind: 'scene', field: 'names' }])
		expect(state.apply(decodeText('*SNL,1,2,2,A,B'))).toEqual([])
		expect(state.apply(decodeText('*SNL,1,2,2,A,C'))).toEqual([{ kind: 'scene', field: 'names' }])
	})

	it('takes what the unit says of itself, field by field', () => {
		const state = new DeviceState()
		expect(state.apply(decodeText('*VE,2.1,1.0,7,3'))).toHaveLength(4)
		expect(state.apply(decodeText('*VE,2.1,1.0,7,4'))).toEqual([{ kind: 'info', field: 'hardwareRevision' }])
	})

	it('changes nothing for errors and events', () => {
		const state = new DeviceState()
		expect(state.apply(decodeText('*CM,Error: syntax'))).toEqual([])
		expect(state.apply(decodeText('*SNR,Sunday'))).toEqual([])
		expect(state.apply(decodeText('*ZZ'))).toEqual([])
	})
})
