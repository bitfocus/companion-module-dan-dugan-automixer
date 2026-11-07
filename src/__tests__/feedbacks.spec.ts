import { beforeEach, describe, expect, it } from 'vitest'
import type { CompanionFeedbackInfo } from '@companion-module/base'
import { FeedbackId, UpdateFeedbacks, feedbacksFor } from '../feedbacks.js'
import { decodeBinary, decodeText } from '../api/decode.js'
import { Code } from '../api/consts.js'
import {
	checkFeedback,
	fakeInstance,
	feedbackDefinitions,
	learnFeedback,
	meterStatusBlock,
	type FakeInstance,
} from './fixtures.js'

let fake: FakeInstance

beforeEach(() => {
	fake = fakeInstance()
	UpdateFeedbacks(fake.self)
})

const check = (id: FeedbackId, options: Record<string, unknown>) =>
	checkFeedback(feedbackDefinitions(fake), id, options as CompanionFeedbackInfo['options'])
const reply = (text: string) => fake.self.state.apply(decodeText(text))
const requested = () => fake.request.mock.calls.map(([query]) => query.text)

describe('feedback definitions', () => {
	it('defines every feedback id', () => {
		expect(Object.keys(feedbackDefinitions(fake)).sort()).toEqual(Object.values(FeedbackId).sort())
	})
})

describe('feedback callbacks', () => {
	it('read the state, and ask for the setting they read', () => {
		reply('*BP,4,1')
		expect(check(FeedbackId.ChannelBypass, { channel: 4 })).toBe(true)
		expect(check(FeedbackId.ChannelBypass, { channel: 5 })).toBe(false)
		expect(requested()).toEqual(['BP,4', 'BP,5'])
		expect(fake.requireSubscription).toHaveBeenCalledTimes(2)
	})

	it('compare a setting to the option', () => {
		reply('*CM,1,2')
		reply('*GA,1,3')
		expect(check(FeedbackId.ChannelMode, { channel: 1, mode: 2 })).toBe(true)
		expect(check(FeedbackId.ChannelMode, { channel: 1, mode: 1 })).toBe(false)
		expect(check(FeedbackId.ChannelGroupAssign, { channel: 1, group: 3 })).toBe(true)
	})

	it('are false for a channel beyond the count, and ask for nothing', () => {
		reply('*CFN,8')
		reply('*BP,9,1')
		expect(check(FeedbackId.ChannelBypass, { channel: 9 })).toBe(false)
		expect(requested()).toEqual([])
	})

	it('read the group flags', () => {
		reply('*SM,2')
		reply('*LH,4')
		expect(check(FeedbackId.GroupMute, { group: 2 })).toBe(true)
		expect(check(FeedbackId.GroupMute, { group: 1 })).toBe(false)
		expect(check(FeedbackId.GroupLastHold, { group: 3 })).toBe(true)
		expect(requested()).toEqual(['SM', 'SM', 'LH'])
	})

	it('check a meter against its range, and ask for nothing, as the meter poll fetches meters', () => {
		fake.self.state.apply(decodeBinary(Code.MeterStatus, meterStatusBlock({ inputPeak: { 2: 12 }, clip: [2] })))
		expect(check(FeedbackId.ChannelInputPeak, { channel: 2, lessThan: 0, greaterThan: -12 })).toBe(true)
		expect(check(FeedbackId.ChannelInputPeak, { channel: 2, lessThan: 0, greaterThan: -3 })).toBe(false)
		expect(check(FeedbackId.ChannelClip, { channel: 2 })).toBe(true)
		expect(requested()).toEqual([])
	})

	it('read the matrix', () => {
		reply('*MXO,3,65')
		reply('*MXM,3,1')
		expect(check(FeedbackId.MatrixOutput, { matrix: 3, output: 65 })).toBe(true)
		expect(check(FeedbackId.MatrixMuted, { matrix: 3 })).toBe(true)
		expect(check(FeedbackId.MatrixMuted, { matrix: 7 })).toBe(false)
		expect(requested()).toEqual(['MXO,3', 'MXM,3'])
	})

	it('read whether the scene has changed', () => {
		reply('*SNA,Sunday,1,1')
		expect(check(FeedbackId.SceneChanged, {})).toBe(true)
		expect(requested()).toEqual(['SNA'])
	})

	it('learn the music system input and the matrix output', async () => {
		reply('*MC,2,81')
		reply('*MXO,1,3')
		const defs = feedbackDefinitions(fake)
		expect(await learnFeedback(defs, FeedbackId.GroupMusicInput, { group: 2 })).toEqual({ input: 81 })
		expect(await learnFeedback(defs, FeedbackId.MatrixOutput, { matrix: 1 })).toEqual({ output: 3 })
	})
})

describe('feedbacksFor', () => {
	it('names the feedbacks reading each change, once each', () => {
		expect(
			feedbacksFor([
				{ kind: 'channel', channel: 1, field: 'bypass' },
				{ kind: 'channel', channel: 2, field: 'bypass' },
				{ kind: 'group', group: 1, field: 'lastHold' },
				{ kind: 'matrix', matrix: 1, field: 'outputPeak' },
				{ kind: 'scene', field: 'changed' },
			]),
		).toEqual([FeedbackId.ChannelBypass, FeedbackId.GroupLastHold, FeedbackId.MatrixLevel, FeedbackId.SceneChanged])
	})

	it('names none for changes no feedback reads', () => {
		expect(
			feedbacksFor([
				{ kind: 'channel', channel: 1, field: 'weight' },
				{ kind: 'crosspoint', matrix: 1, input: 1 },
				{ kind: 'info', field: 'hostName' },
			]),
		).toEqual([])
	})
})
