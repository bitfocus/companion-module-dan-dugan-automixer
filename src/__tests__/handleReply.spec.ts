import { beforeEach, describe, expect, it } from 'vitest'
import { HandleReply } from '../handleReply.js'
import { decodeBinary, decodeText } from '../api/decode.js'
import { Code } from '../api/consts.js'
import { FeedbackId } from '../feedbacks.js'
import { fakeInstance, meterStatusBlock, sentTexts, type FakeInstance } from './fixtures.js'

let fake: FakeInstance

beforeEach(() => {
	fake = fakeInstance()
})

const handle = (text: string) => HandleReply(fake.self, decodeText(text))

describe('HandleReply, variables and feedbacks', () => {
	it('writes the variables and rechecks the feedbacks a change affects', () => {
		handle('*CW,3,-6')
		handle('*BP,3,1')
		expect(fake.setVariableValues).toHaveBeenCalledWith({ channelWeight3: -6 })
		expect(fake.checkFeedbacks).toHaveBeenCalledExactlyOnceWith(FeedbackId.ChannelBypass)
	})

	it('does nothing for a reply that repeats what is known', () => {
		handle('*BP,3,1')
		fake.setVariableValues.mockClear()
		fake.checkFeedbacks.mockClear()
		handle('*BP,3,1')
		expect(fake.setVariableValues).not.toHaveBeenCalled()
		expect(fake.checkFeedbacks).not.toHaveBeenCalled()
	})

	it('rechecks last hold feedbacks, which 1.x never did', () => {
		handle('*LH,1')
		expect(fake.checkFeedbacks).toHaveBeenCalledWith(FeedbackId.GroupLastHold)
	})

	it('rechecks each meter feedback once for a whole GS reply', () => {
		HandleReply(fake.self, decodeBinary(Code.MeterStatus, meterStatusBlock({ automixGain: { 1: 2, 2: 4 }, clip: [5] })))
		expect(fake.checkFeedbacks).toHaveBeenCalledOnce()
		const ids = fake.checkFeedbacks.mock.calls[0]
		expect(ids).toEqual(expect.arrayContaining([FeedbackId.ChannelClip, FeedbackId.ChannelAutomixGain]))
		expect(new Set(ids).size).toBe(ids.length)
		// Nothing moved on the input or output meters, which start at the floor too
		expect(ids).not.toContain(FeedbackId.ChannelInputPeak)
	})

	it('works out who is talking when the automix gains move', () => {
		HandleReply(fake.self, decodeBinary(Code.MeterStatus, meterStatusBlock({ automixGain: { 2: 2 } })))
		expect(fake.setVariableValues).toHaveBeenCalledWith(
			expect.objectContaining({ channelAmixGain2: -1, isTalkingChannel: 2, isTalkingName: 'Channel 2' }),
		)
	})
})

describe('HandleReply, the action recorder', () => {
	beforeEach(() => {
		fake.self.isRecordingActions = true
	})

	it('records a channel change as the action that makes it', () => {
		handle('*BP,4,1')
		handle('*CW,4,-2.5')
		expect(fake.recordAction.mock.calls).toEqual([
			[{ actionId: 'channel_bypass', options: { channel: 4, bypass: 1, query: false } }, 'channel_bypass 4'],
			[{ actionId: 'channel_weight', options: { channel: 4, weight: -2.5, query: false } }, 'channel_weight 4'],
		])
	})

	it('records group, matrix and crosspoint changes', () => {
		handle('*SM,5')
		handle('*MT,2,-8')
		handle('*MXM,3,1')
		handle('*OM,1,70,-6')
		expect(fake.recordAction.mock.calls).toEqual([
			[{ actionId: 'group_mute', options: { groupA: 1, groupB: 0, groupC: 4, query: false } }, 'group_mute'],
			[
				{ actionId: 'group_musicthreshold', options: { group: 2, threshold: -8, query: false } },
				'group_musicthreshold 2',
			],
			[{ actionId: 'matrix_mute', options: { matrix: 3, mute: 1, query: false } }, 'matrix_mute 3'],
			[
				{ actionId: 'matrix_crosspoint', options: { matrix: 1, channel: 70, gain: -6, query: false } },
				'matrix_crosspoint 1 70',
			],
		])
	})

	it('records scene recalls and defaults, which are events rather than settings', () => {
		handle('*SNR,Sunday')
		handle('*FP')
		expect(fake.recordAction.mock.calls).toEqual([
			[{ actionId: 'sc_recall', options: { name: 'Sunday' } }, 'sc_recall'],
			[{ actionId: 'recall_default', options: { mode: 'FP' } }, 'recall_default'],
		])
	})

	it('records nothing that has not changed, such as the replies to queries on connecting', () => {
		handle('*CM,1,1')
		handle('*CN,1,Channel 1')
		expect(fake.recordAction).not.toHaveBeenCalled()
	})

	it('records nothing while the recorder is off', () => {
		fake.self.isRecordingActions = false
		handle('*BP,4,1')
		expect(fake.recordAction).not.toHaveBeenCalled()
	})
})

describe('HandleReply, follow ups', () => {
	it('asks for the scene names once it knows how many there are', () => {
		handle('*SNC,3')
		expect(sentTexts(fake.sendBackground)).toEqual(['SNL,1,3'])
	})

	it('clears the scene list when there are none, and updates the dropdowns', () => {
		handle('*SNL,1,1,1,Sunday')
		fake.updateActions.mockClear()
		handle('*SNC,0')
		expect(fake.self.state.scenes.names).toEqual([])
		expect(fake.updateActions).toHaveBeenCalledOnce()
		expect(fake.sendBackground).not.toHaveBeenCalled()
	})

	it('updates the scene dropdowns when the list changes, and only then', () => {
		handle('*SNL,1,1,1,Sunday')
		handle('*SNL,1,1,1,Sunday')
		expect(fake.updateActions).toHaveBeenCalledOnce()
	})

	it('asks again after a scene is saved, recalled or reset', () => {
		handle('*SNS,Sunday')
		handle('*SNR,Sunday')
		handle('*FP')
		expect(sentTexts(fake.sendBackground)).toEqual(['SNC', 'SNA', 'SNA', 'SNA'])
	})

	it('asks for the crosspoints again after the matrix is reset', () => {
		handle('*RM')
		expect(sentTexts(fake.sendBackground)).toEqual(['GM'])
	})

	it('follows the unit when its channel count differs from the config', () => {
		handle('*CFN,32')
		expect(fake.self.channelCount).toBe(32)
		expect(fake.updateDefinitions).toHaveBeenCalledOnce()
		expect(fake.log).toHaveBeenCalledWith('warn', 'The unit has 32 automix channels, not 64')
		handle('*CFN,32')
		expect(fake.updateDefinitions).toHaveBeenCalledOnce()
	})

	it('follows the unit when its model differs from the config', () => {
		handle('*SC,11,Dugan-M,M01,2.1,7,3,00:1D:C1:00:00:01,10.0.0.2,255.0.0.0,10.0.0.1,0,64')
		expect(fake.self.model).toBe(11)
		expect(fake.updateDefinitions).toHaveBeenCalledOnce()
		expect(fake.log).toHaveBeenCalledWith('warn', 'Configured as a Model-N, but connected to a Model-M')
	})

	it('warns when the unit can take no more clients', () => {
		handle('*CC,UDP:2,TCP:3')
		expect(fake.log).toHaveBeenCalledWith('warn', 'All connections full, cannot accept more concurrent clients')
	})

	it('logs errors and replies it does not understand', () => {
		handle('*CM,Error: Channel number out of range')
		handle('*QQ,1')
		expect(fake.log).toHaveBeenCalledWith('warn', 'Bad response: CM,Error: Channel number out of range')
		expect(fake.log).toHaveBeenCalledWith('warn', 'Unexpected response from unit: unknown reply QQ')
	})
})
