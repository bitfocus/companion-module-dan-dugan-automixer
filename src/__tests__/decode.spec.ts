import { describe, expect, it } from 'vitest'
import {
	decodeBinary,
	decodeChannelBulk,
	decodeMatrixBulk,
	decodeMeterStatus,
	decodeText,
	gainFromByte,
	levelFromByte,
	splitReply,
} from '../api/decode.js'
import { Code } from '../api/consts.js'
import { channelBulkBlock, matrixBulkBlock, meterStatusBlock } from './fixtures.js'

const sixtyFour = <T>(value: (channel: number) => T) => Array.from({ length: 64 }, (_, i) => value(i + 1))

describe('splitReply', () => {
	it('splits off the SOM, the code and the parameters', () => {
		expect(splitReply('*CN,3,Lectern')).toEqual({ code: 'CN', params: ['3', 'Lectern'] })
		expect(splitReply('*FP')).toEqual({ code: 'FP', params: [] })
	})
})

describe('decodeText, channel replies', () => {
	it.each([
		['CM', 'mode', '2', 2],
		['CP', 'preset', '0', 0],
		['BP', 'bypass', '1', 1],
		['CO', 'override', '1', 1],
		['CW', 'weight', '-2.5', -2.5],
		['MR', 'music', '1', 1],
		['NE', 'nom', '0', 0],
		['GA', 'group', '3', 3],
	])('%s is the channel %s', (code, field, value, expected) => {
		expect(decodeText(`*${code},5,${value}`)).toEqual({ type: 'channel', field, channel: 5, value: expected })
	})

	it('reads a name', () => {
		expect(decodeText('*CN,12,Lectern')).toEqual({ type: 'channelName', channel: 12, name: 'Lectern' })
	})

	it('reads a block of names', () => {
		expect(decodeText('*CNS,17,3,Pastor,Choir L,Choir R')).toEqual({
			type: 'channelNames',
			first: 17,
			names: ['Pastor', 'Choir L', 'Choir R'],
		})
	})

	it('rejects a block of names that is not the length it says', () => {
		expect(decodeText('*CNS,1,3,A,B')).toMatchObject({ type: 'unexpected' })
	})

	it('rejects a channel the protocol does not have', () => {
		expect(decodeText('*CM,65,1')).toMatchObject({ type: 'unexpected', reason: 'CM: no channel 65' })
		expect(decodeText('*CM,0,1')).toMatchObject({ type: 'unexpected' })
	})

	it('rejects the wrong number of parameters', () => {
		expect(decodeText('*CM,1')).toMatchObject({ type: 'unexpected', reason: 'CM: expected 2 parameters, not 1' })
	})

	it('rejects a value that is not a number', () => {
		expect(decodeText('*CW,1,loud')).toMatchObject({ type: 'unexpected' })
	})
})

describe('decodeText, group and matrix replies', () => {
	it('reads a group mask', () => {
		expect(decodeText('*SM,5')).toEqual({ type: 'groupFlags', flag: 'mute', mask: 5 })
		expect(decodeText('*LH,2')).toEqual({ type: 'groupFlags', flag: 'lastHold', mask: 2 })
		expect(decodeText('*SP,8')).toMatchObject({ type: 'unexpected' })
	})

	it('reads automix depth under either of its codes', () => {
		const reply = { type: 'group', field: 'automixDepth', group: 2, value: -12 }
		expect(decodeText('*ME,2,-12')).toEqual(reply)
		expect(decodeText('*AD,2,-12')).toEqual(reply)
	})

	it('reads the other group settings', () => {
		expect(decodeText('*NL,1,2.5')).toEqual({ type: 'group', field: 'nomGainLimit', group: 1, value: 2.5 })
		expect(decodeText('*MT,3,-8')).toEqual({ type: 'group', field: 'musicThreshold', group: 3, value: -8 })
		expect(decodeText('*MC,1,81')).toEqual({ type: 'group', field: 'musicInput', group: 1, value: 81 })
		expect(decodeText('*NL,4,1')).toMatchObject({ type: 'unexpected' })
	})

	it('reads matrix settings', () => {
		expect(decodeText('*MXM,6,1')).toEqual({ type: 'matrix', field: 'mute', matrix: 6, value: 1 })
		expect(decodeText('*MXP,1,0')).toEqual({ type: 'matrix', field: 'polarity', matrix: 1, value: 0 })
		expect(decodeText('*MXV,2,-3.5')).toEqual({ type: 'matrix', field: 'gain', matrix: 2, value: -3.5 })
		expect(decodeText('*MXO,3,65')).toEqual({ type: 'matrix', field: 'output', matrix: 3, value: 65 })
		expect(decodeText('*MXM,7,1')).toMatchObject({ type: 'unexpected' })
	})

	it('reads a crosspoint', () => {
		expect(decodeText('*OM,2,130,-6')).toEqual({ type: 'crosspoint', matrix: 2, input: 130, gain: -6 })
		expect(decodeText('*OM,2,145,-6')).toMatchObject({ type: 'unexpected' })
	})
})

describe('decodeText, meters', () => {
	it('reads a meter for every channel, as half dB steps down', () => {
		const params = sixtyFour((channel) => channel).join(',')
		expect(decodeText(`*GSA,${params}`)).toEqual({
			type: 'channelMeters',
			meter: 'automixGain',
			values: sixtyFour((channel) => -channel / 2),
		})
		expect(decodeText(`*GSI,${params}`)).toMatchObject({ meter: 'inputPeak' })
		expect(decodeText(`*GSO,${params}`)).toMatchObject({ meter: 'outputPeak' })
	})

	it('rejects a meter list short of a channel', () => {
		expect(
			decodeText(
				`*GSA,${sixtyFour(() => 0)
					.slice(1)
					.join(',')}`,
			),
		).toMatchObject({ type: 'unexpected' })
	})

	it('reads group and matrix meters', () => {
		expect(decodeText('*GSN,0,10,20')).toEqual({ type: 'groupMeters', meter: 'nomPeak', values: [0, -5, -10] })
		expect(decodeText('*GSM,2,4,6')).toEqual({ type: 'groupMeters', meter: 'musicPeak', values: [-1, -2, -3] })
		expect(decodeText('*GSX,0,0,0,0,0,255')).toEqual({ type: 'matrixMeters', values: [0, 0, 0, 0, 0, -127.5] })
	})

	it('reads signal presence as eight hex bytes, under either code', () => {
		const expected = sixtyFour((channel) => channel === 1 || channel === 16 || channel === 64)
		expect(decodeText('*GSP,01,80,0,0,0,0,0,80')).toEqual({ type: 'channelFlags', flag: 'presence', values: expected })
		expect(decodeText('*GSS,01,80,0,0,0,0,0,80')).toEqual({ type: 'channelFlags', flag: 'presence', values: expected })
		expect(decodeText('*GSC,ff,0,0,0,0,0,0,0')).toMatchObject({ flag: 'clip' })
		expect(decodeText('*GSP,zz,0,0,0,0,0,0,0')).toMatchObject({ type: 'unexpected' })
	})
})

describe('decodeText, scenes', () => {
	it('reads the count and the active scene', () => {
		expect(decodeText('*SNC,4')).toEqual({ type: 'sceneCount', count: 4 })
		expect(decodeText('*SNA,Sunday,2,1')).toEqual({ type: 'sceneActive', name: 'Sunday', index: 2, changed: true })
		expect(decodeText('*SNA,Sunday,2,0')).toMatchObject({ changed: false })
	})

	it('reads the scene list from the fourth parameter', () => {
		expect(decodeText('*SNL,1,2,2,Sunday,Wedding')).toEqual({ type: 'sceneList', names: ['Sunday', 'Wedding'] })
		expect(decodeText('*SNL,1,0,0')).toEqual({ type: 'sceneList', names: [] })
	})

	it('reads scene events', () => {
		expect(decodeText('*SNR,Sunday')).toEqual({ type: 'scene', event: 'recalled', names: ['Sunday'] })
		expect(decodeText('*SNE,Old,New')).toEqual({ type: 'scene', event: 'renamed', names: ['Old', 'New'] })
		expect(decodeText('*FP')).toEqual({ type: 'scene', event: 'channelDefaults', names: [] })
		expect(decodeText('*RM')).toEqual({ type: 'scene', event: 'matrixDefaults', names: [] })
	})

	it('reports a scene that could not be found as an error', () => {
		expect(decodeText('*SNR,Error: scene not found')).toEqual({
			type: 'error',
			code: 'SNR',
			message: 'Error: scene not found',
		})
	})
})

describe('decodeText, system', () => {
	it('reads the system configuration', () => {
		expect(
			decodeText('*SC,12,Dugan-N,N01234,2.1,7,3,00:1D:C1:00:00:01,192.168.0.10,255.255.255.0,192.168.0.1,1,48'),
		).toEqual({
			type: 'info',
			info: {
				model: 12,
				hostName: 'Dugan-N',
				serialNumber: 'N01234',
				firmwareVersion: '2.1',
				fpgaVersion: '7',
				hardwareRevision: '3',
				macAddress: '00:1D:C1:00:00:01',
				ipAddress: '192.168.0.10',
				netMask: '255.255.255.0',
				gateway: '192.168.0.1',
				dhcp: true,
				channelCount: 48,
			},
		})
	})

	it('reads the addresses from all four octets', () => {
		// 1.x took parameters 2 to 5 of the 4, so it lost the first octet and appended "undefined"
		expect(decodeText('*IP,192,168,0,10')).toEqual({ type: 'info', info: { ipAddress: '192.168.0.10' } })
		expect(decodeText('*NM,255,255,255,0')).toEqual({ type: 'info', info: { netMask: '255.255.255.0' } })
		expect(decodeText('*GW,192,168,0,1')).toEqual({ type: 'info', info: { gateway: '192.168.0.1' } })
	})

	it('reads master mode from its one parameter', () => {
		// 1.x read a second parameter that isn't there, so it always said false
		expect(decodeText('*MM,1')).toEqual({ type: 'info', info: { master: true } })
		expect(decodeText('*MM,0')).toEqual({ type: 'info', info: { master: false } })
	})

	it('reads DHCP as DHCP', () => {
		// 1.x wrote it to the master variable
		expect(decodeText('*DH,1')).toEqual({ type: 'info', info: { dhcp: true } })
	})

	it('reads the labelled figures', () => {
		expect(decodeText('*CC,UDP:1,TCP:2')).toEqual({ type: 'info', info: { clientUDP: 1, clientTCP: 2 } })
		expect(decodeText('*HW,HB:1,LWIP:2,DSP:3,TCPIP:4,MACRX:5,MACTX:6,RTOS:7,MALLOC:8')).toEqual({
			type: 'info',
			info: { heartBeat: 1, lwip: 2, dsp: 3, tcpip: 4, macRX: 5, macTX: 6, rtosHeapFree: 7, mallocHeapFree: 8 },
		})
	})

	it('reads the single settings', () => {
		expect(decodeText('*VE,2.1,1.0,7,3')).toEqual({
			type: 'info',
			info: { firmwareVersion: '2.1', firmwareSecVersion: '1.0', fpgaVersion: '7', hardwareRevision: '3' },
		})
		expect(decodeText('*SF,1')).toEqual({ type: 'info', info: { sampleRate: '96kHz' } })
		expect(decodeText('*SF,44')).toEqual({ type: 'info', info: { sampleRate: '44' } })
		expect(decodeText('*CFN,32')).toEqual({ type: 'info', info: { channelCount: 32 } })
		expect(decodeText('*BM,1')).toEqual({ type: 'info', info: { blinkMode: true } })
		expect(decodeText('*NA,Booth')).toEqual({ type: 'info', info: { hostName: 'Booth' } })
	})

	it('reads the subscription level', () => {
		expect(decodeText('*SU,1')).toEqual({ type: 'subscribe', level: 1 })
		expect(decodeText('*SU,3')).toMatchObject({ type: 'unexpected' })
	})
})

describe('decodeText, errors and the unknown', () => {
	it.each(['Error: syntax', 'ERROR: syntax', 'Error: Channel number out of range'])('reports %s', (message) => {
		expect(decodeText(`*CM,${message}`)).toEqual({ type: 'error', code: 'CM', message })
	})

	it('passes on what is only logged', () => {
		expect(decodeText('*PN,5')).toEqual({ type: 'notice', code: 'PN', message: 'Ping received: 5' })
	})

	it('reports a code it does not know', () => {
		expect(decodeText('*ZZ,1')).toEqual({ type: 'unexpected', reason: 'unknown reply ZZ' })
	})
})

describe('binary replies', () => {
	it('converts bytes as the 1.x module did', () => {
		expect(levelFromByte(0)).toBe(0)
		expect(levelFromByte(255)).toBe(-127.5)
		expect(gainFromByte(192)).toBe(0)
		expect(gainFromByte(0)).toBe(-96)
		expect(gainFromByte(222)).toBe(15)
	})

	it('reads every field of GS', () => {
		const status = decodeMeterStatus(
			meterStatusBlock({
				presence: [1, 9, 64],
				clip: [2],
				automixGain: { 1: 6, 64: 20 },
				inputPeak: { 3: 12 },
				outputPeak: { 4: 24 },
				nomPeak: { 1: 2, 3: 4 },
				musicPeak: { 2: 8 },
				matrixPeak: { 6: 30 },
			}),
		)
		expect(status.presence).toEqual(sixtyFour((channel) => [1, 9, 64].includes(channel)))
		expect(status.clip).toEqual(sixtyFour((channel) => channel === 2))
		expect(status.automixGain[0]).toBe(-3)
		expect(status.automixGain[63]).toBe(-10)
		expect(status.inputPeak[2]).toBe(-6)
		expect(status.outputPeak[3]).toBe(-12)
		expect(status.inputPeak[0]).toBe(-127.5)
		expect(status.nomPeak).toEqual([-1, -127.5, -2])
		expect(status.musicPeak).toEqual([-127.5, -4, -127.5])
		expect(status.matrixPeak).toEqual([-127.5, -127.5, -127.5, -127.5, -127.5, -15])
	})

	it('reads the GP flags from the bytes', () => {
		// 1.x passed the bytes' offsets, 69 to 132, in place of the bytes, so every channel got the same made-up flags
		const bulk = decodeChannelBulk(
			channelBulkBlock({
				modes: { 1: 0, 2: 2 },
				channelCount: 32,
				bypass: [3],
				nom: [4],
				music: [5],
				override: [6],
				groups: { 1: 2, 7: 3 },
				presets: { 2: 2 },
			}),
		)
		expect(bulk.modes.slice(0, 3)).toEqual([0, 2, 0])
		expect(bulk.channelCount).toBe(32)
		expect(bulk.bypass).toEqual(sixtyFour((channel) => channel === 3))
		expect(bulk.nom).toEqual(sixtyFour((channel) => channel === 4))
		expect(bulk.music).toEqual(sixtyFour((channel) => channel === 5))
		expect(bulk.override).toEqual(sixtyFour((channel) => channel === 6))
		expect(bulk.groups.slice(0, 8)).toEqual([2, 0, 0, 0, 0, 0, 3, 0])
		expect(bulk.presets.slice(0, 3)).toEqual([0, 2, 0])
	})

	it('reads every crosspoint and matrix gain of GM', () => {
		const bulk = decodeMatrixBulk(matrixBulkBlock({ crosspoints: { '1:1': 192, '6:144': 180 }, gains: { 2: 202 } }))
		expect(bulk.crosspoints).toHaveLength(6)
		expect(bulk.crosspoints[0][0]).toBe(0)
		expect(bulk.crosspoints[0][1]).toBe(-96)
		expect(bulk.crosspoints[5][143]).toBe(-6)
		expect(bulk.gains).toEqual([0, 5, 0, 0, 0, 0])
	})

	it('decodes by code', () => {
		expect(decodeBinary(Code.MeterStatus, meterStatusBlock())).toMatchObject({ type: 'meterStatus' })
		expect(decodeBinary(Code.ChannelBulk, channelBulkBlock())).toMatchObject({ type: 'channelBulk' })
		expect(decodeBinary(Code.MatrixBulk, matrixBulkBlock())).toMatchObject({ type: 'matrixBulk' })
	})
})
