import { describe, expect, it } from 'vitest'
import {
	channelName,
	channelNames,
	channelQuery,
	channelSet,
	command,
	crosspointQuery,
	crosspointSet,
	formatNumber,
	groupFlags,
	groupQuery,
	groupSet,
	matrixQuery,
	matrixSet,
	network,
	safeName,
	sceneNamed,
	sceneNames,
	sceneRename,
	systemName,
} from '../api/messages.js'
import { Code } from '../api/consts.js'

describe('command text', () => {
	it('joins the code and parameters', () => {
		expect(channelQuery(Code.ChannelMode, 3).text).toBe('CM,3')
		expect(channelSet(Code.ChannelMode, 3, 1).text).toBe('CM,3,1')
		expect(groupFlags(Code.GroupMute).text).toBe('SM')
		expect(groupFlags(Code.GroupMute, 5).text).toBe('SM,5')
		expect(groupQuery(Code.GroupAutomixDepth, 2).text).toBe('ME,2')
		expect(matrixSet(Code.MatrixOutput, 6, 80).text).toBe('MXO,6,80')
		expect(crosspointSet(1, 144, -96).text).toBe('OM,1,144,-96')
		expect(command(Code.Subscribe, 1).text).toBe('SU,1')
		expect(command(Code.SceneSaveNew).text).toBe('SNN')
	})

	it('writes levels to two decimal places at most', () => {
		expect(formatNumber(2.5)).toBe('2.5')
		expect(formatNumber(-3)).toBe('-3')
		expect(formatNumber(0.1 + 0.2)).toBe('0.3')
		expect(formatNumber(-0)).toBe('0')
		expect(channelSet(Code.ChannelWeight, 1, 1.005 + 2).text).toBe('CW,1,3')
		expect(() => formatNumber(Number.NaN)).toThrow(RangeError)
	})

	it('asks for names in blocks', () => {
		expect(channelNames(49, 16).text).toBe('CNS,49,16')
		expect(() => channelNames(60, 16)).toThrow(RangeError)
		expect(sceneNames(1, 12).text).toBe('SNL,1,12')
	})

	it('checks channels, groups, matrices and inputs', () => {
		expect(() => channelQuery(Code.ChannelMode, 0)).toThrow(RangeError)
		expect(() => channelSet(Code.ChannelMode, 65, 1)).toThrow(RangeError)
		expect(() => groupQuery(Code.GroupNomGainLimit, 4)).toThrow(RangeError)
		expect(() => groupSet(Code.GroupMusicInput, 1, 87)).toThrow(RangeError)
		expect(() => matrixQuery(Code.MatrixMute, 7)).toThrow(RangeError)
		expect(() => matrixSet(Code.MatrixOutput, 1, 81)).toThrow(RangeError)
		expect(() => crosspointQuery(1, 145)).toThrow(RangeError)
		expect(() => groupFlags(Code.GroupMute, 8)).toThrow(RangeError)
	})
})

describe('names', () => {
	it('keeps a name up to the first character the protocol uses', () => {
		expect(safeName('Lectern')).toBe('Lectern')
		expect(safeName('Choir; left')).toBe('Choir')
		expect(safeName('A,B')).toBe('A')
		expect(safeName('Mic*2')).toBe('Mic')
		expect(safeName('Time: 10')).toBe('Time')
	})

	it('cuts a name to 16 characters', () => {
		expect(safeName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop')
	})

	it('has nothing left of a name starting with a forbidden character', () => {
		expect(safeName(',x')).toBeUndefined()
		expect(safeName('')).toBeUndefined()
		expect(() => channelName(1, ';')).toThrow(RangeError)
	})

	it('builds named commands', () => {
		expect(channelName(2, 'Pulpit').text).toBe('CN,2,Pulpit')
		expect(sceneNamed(Code.SceneRecall, 'Sunday').text).toBe('SNR,Sunday')
		expect(sceneRename('Old', 'New').text).toBe('SNE,Old,New')
		expect(systemName('Booth').text).toBe('NA,Booth')
	})
})

describe('network addresses', () => {
	it('sends the four octets', () => {
		expect(network(Code.IpAddress, '192.168.1.20').text).toBe('IP,192,168,1,20')
		expect(network(Code.Gateway, ' 10.0.0.1 ').text).toBe('GW,10,0,0,1')
	})

	it.each(['192.168.1', '192.168.1.256', '1..2.3', 'a.b.c.d', '192.168.1.1.1', '-1.0.0.0'])('refuses %s', (address) => {
		expect(() => network(Code.Netmask, address)).toThrow(RangeError)
	})
})

describe('reply matching', () => {
	it('expects a reply under the command code, about the same channel, group or matrix', () => {
		expect(channelSet(Code.ChannelBypass, 4, 1).reply).toEqual({ codes: ['BP'], index: 4 })
		expect(crosspointQuery(2, 10).reply).toEqual({ codes: ['OM'], index: 2 })
		expect(channelNames(17, 16).reply).toEqual({ codes: ['CNS'], index: 17 })
		expect(command(Code.SystemConfig).reply).toEqual({ codes: ['SC'], index: undefined })
	})

	it('expects commands with two codes to be answered under either', () => {
		expect(groupSet(Code.GroupAutomixDepth, 1, -10).reply.codes).toEqual(['ME', 'AD'])
		expect(command(Code.MeterSignalPresence).reply.codes).toEqual(['GSS', 'GSP'])
		expect(command(Code.MeterSignalClip).reply.codes).toEqual(['GSC', 'GSS'])
	})
})
