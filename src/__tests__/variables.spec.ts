import { describe, expect, it } from 'vitest'
import {
	UNKNOWN,
	UpdateVariableDefinitions,
	allValues,
	changedValues,
	systemValues,
	talkingValues,
} from '../variables.js'
import { DeviceState } from '../state.js'
import { decodeBinary, decodeText } from '../api/decode.js'
import { Code } from '../api/consts.js'
import { fakeInstance, matrixBulkBlock, meterStatusBlock } from './fixtures.js'

function definedIds(): string[] {
	const fake = fakeInstance()
	UpdateVariableDefinitions(fake.self)
	return Object.keys(fake.setVariableDefinitions.mock.calls[0][0])
}

describe('variable definitions', () => {
	it('define every variable written', () => {
		const ids = new Set(definedIds())
		const written = Object.keys(allValues(new DeviceState(), 12, 64, -3))
		expect(written.filter((id) => !ids.has(id))).toEqual([])
		expect([...ids].filter((id) => !written.includes(id))).toEqual([])
	})

	it('keep the ids users reference, typos included', () => {
		const ids = definedIds()
		for (const id of ['hardwareRevsion', 'mallocHeadFree', 'channelName64', 'matrix6Xpoint144', 'groupMSTgain3']) {
			expect(ids).toContain(id)
		}
		expect(ids).toHaveLength(37 + 64 * 5 + 6 * (2 + 144) + 3 * 5)
	})
})

describe('system values', () => {
	it('are unknown until reported', () => {
		const values = systemValues({}, 12)
		expect(values.hostName).toBe(UNKNOWN)
		expect(values.channelCount).toBe(UNKNOWN)
	})

	it('label the model, clock source and ADAT mirror', () => {
		expect(systemValues({ model: 11, clockSource: 0, adatMirror: 2 }, 11)).toMatchObject({
			deviceType: 'Model-M',
			clockSource: 'Madi',
			adatMirror: '16 Channels',
		})
		expect(systemValues({ clockSource: 0 }, 12).clockSource).toBe('Dante')
		expect(systemValues({ clockSource: 2 }, 12).clockSource).toBe('Internal')
		expect(systemValues({ model: 3 }, 12).deviceType).toBe('3')
	})

	it('write DHCP and master to their own variables', () => {
		const state = new DeviceState()
		state.apply(decodeText('*DH,1'))
		state.apply(decodeText('*MM,0'))
		expect(systemValues(state.info, 12)).toMatchObject({ dhcp: true, master: false })
	})

	it('write the malloc figure under its old id', () => {
		expect(systemValues({ mallocHeapFree: 42, hardwareRevision: '3' }, 12)).toMatchObject({
			mallocHeadFree: 42,
			hardwareRevsion: '3',
		})
	})
})

describe('talking values', () => {
	it('name the channel with the least gain reduction, at or above the threshold', () => {
		const state = new DeviceState()
		state.apply(decodeText('*CN,3,Pastor'))
		state.apply(decodeBinary(Code.MeterStatus, meterStatusBlock({ automixGain: { 1: 20, 2: 8, 3: 2, 4: 40 } })))
		expect(talkingValues(state, 64, -3)).toEqual({ isTalkingChannel: 3, isTalkingName: 'Pastor' })
		expect(talkingValues(state, 64, -0.5)).toEqual({ isTalkingChannel: 0, isTalkingName: '' })
	})

	it('only count the unit’s channels', () => {
		const state = new DeviceState()
		state.apply(decodeBinary(Code.MeterStatus, meterStatusBlock({ automixGain: { 9: 0 } })))
		expect(state.channel(9)?.automixGain).toBe(0)
		expect(talkingValues(state, 8, -3)).toEqual({ isTalkingChannel: 0, isTalkingName: '' })
	})
})

describe('changed values', () => {
	it('write the variables each change affects', () => {
		const state = new DeviceState()
		const changes = [
			...state.apply(decodeText('*CW,2,-4')),
			...state.apply(decodeText('*ME,1,-20')),
			...state.apply(decodeText('*OM,2,5,-6')),
		]
		expect(changedValues(state, changes, 12)).toEqual({ channelWeight2: -4, groupAD1: -20, matrix2Xpoint5: -6 })
	})

	it('write the matrix fader from the matrix gain', () => {
		// 1.x wrote the GM gains to a misspelt id, and seeded the fader with the output patch
		const state = new DeviceState()
		const changes = state.apply(decodeBinary(Code.MatrixBulk, matrixBulkBlock({ gains: { 4: 182 } })))
		expect(changedValues(state, changes, 12)).toEqual({ matrixOutFader4: -5 })
	})

	it('write every system variable when any changes, and the scene variables when a scene setting does', () => {
		const state = new DeviceState()
		const values = changedValues(
			state,
			[...state.apply(decodeText('*NA,Booth')), ...state.apply(decodeText('*SNC,3'))],
			12,
		)
		expect(values).toMatchObject({ hostName: 'Booth', deviceType: UNKNOWN, sceneCount: 3, sceneActive: UNKNOWN })
	})
})
