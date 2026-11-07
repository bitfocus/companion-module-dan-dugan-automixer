import { setTimeout as sleep } from 'node:timers/promises'
import {
	InstanceStatus,
	type CompanionActionDefinitions,
	type CompanionFeedbackDefinitions,
} from '@companion-module/base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DuganInstance from '../main.js'
import type { ModuleConfig } from '../config.js'
import { ActionIdChannel, type ActionSchema } from '../actions.js'
import { FeedbackId, type FeedbackSchema } from '../feedbacks.js'
import { FakeDugan } from './fakeDugan.js'
import { checkFeedback, config as baseConfig, runAction } from './fixtures.js'

/** What InstanceBase needs from the host, with everything it forwards to Companion mocked */
function createContext() {
	return {
		id: 'test-instance',
		_isInstanceContext: true as const,
		label: 'test',
		upgradeScripts: [],
		saveConfig: vi.fn(),
		updateStatus: vi.fn(),
		oscSend: vi.fn(),
		recordAction: vi.fn(),
		setActionDefinitions: vi.fn(),
		subscribeActions: vi.fn(),
		unsubscribeActions: vi.fn(),
		setFeedbackDefinitions: vi.fn(),
		unsubscribeFeedbacks: vi.fn(),
		checkFeedbacks: vi.fn(),
		checkAllFeedbacks: vi.fn(),
		checkFeedbacksById: vi.fn(),
		setPresetDefinitions: vi.fn(),
		setCompositeElementDefinitions: vi.fn(),
		setVariableDefinitions: vi.fn(),
		setVariableValues: vi.fn(),
		getVariableValue: vi.fn(),
		sharedUdpSocketHandlers: new Map(),
		sharedUdpSocketJoin: vi.fn(),
		sharedUdpSocketLeave: vi.fn(),
		sharedUdpSocketSend: vi.fn(),
	}
}

type Context = ReturnType<typeof createContext>

let fake: FakeDugan
const instances: DuganInstance[] = []

beforeEach(async () => {
	fake = new FakeDugan()
	await fake.listen()
})

afterEach(async () => {
	for (const instance of instances.splice(0)) await instance.destroy()
	await fake.close()
})

function config(overrides: Partial<ModuleConfig> = {}): ModuleConfig {
	return baseConfig({ port: fake.port, ...overrides })
}

function createInstance() {
	const context = createContext()
	const instance = new DuganInstance(context)
	// The unit is on loopback and answers at once, so the connection needn't wait long for it
	instance.connectionTiming = { messageGap: 1, replyTimeout: 200, reconnectInterval: 50 }
	const log = vi.spyOn(instance, 'log').mockImplementation(() => {})
	instances.push(instance)
	return { instance, context, log }
}

async function until(condition: () => boolean, timeout = 5000): Promise<void> {
	const start = Date.now()
	while (!condition()) {
		if (Date.now() - start > timeout) throw new Error('timed out waiting')
		await sleep(5)
	}
}

const allValues = (context: Context) =>
	Object.assign({}, ...context.setVariableValues.mock.calls.map(([values]) => values as object)) as Record<
		string,
		unknown
	>

const actions = (context: Context) =>
	context.setActionDefinitions.mock.calls.at(-1)?.[0] as CompanionActionDefinitions<ActionSchema>
const feedbacks = (context: Context) =>
	context.setFeedbackDefinitions.mock.calls.at(-1)?.[0] as CompanionFeedbackDefinitions<FeedbackSchema>

/**
 * Waits for the queries on connecting to be answered. The scene list comes last: it is asked for on hearing the scene
 * count, by which time everything else is queued
 */
async function connected(instance: DuganInstance, context: Context) {
	await until(() => 'groupMST3' in allValues(context) && instance.state.scenes.names.length > 0)
}

describe('DuganInstance', () => {
	it('says so when there is no host', async () => {
		const { instance, context } = createInstance()
		await instance.init(config({ host: '' }))
		expect(context.updateStatus).toHaveBeenLastCalledWith(InstanceStatus.BadConfig, 'No host')
		expect(context.setActionDefinitions).toHaveBeenCalled()
		expect(context.setVariableDefinitions).toHaveBeenCalled()
	})

	it('asks for the unit, its scenes, names, matrix, weights and group settings on connecting', async () => {
		const { instance, context } = createInstance()
		await instance.init(config())
		await connected(instance, context)
		const texts = fake.texts()
		expect(texts.slice(0, 15)).toEqual([
			'SC',
			'VE',
			'BM',
			'HW',
			'HR',
			'SNC',
			'SNA',
			'LG',
			'CS',
			'AM',
			'CC',
			'SF',
			'MM',
			'CFS',
			'CFN',
		])
		expect(texts).toEqual(
			expect.arrayContaining([
				'SU,1',
				'CNS,1,16',
				'CNS,49,16',
				'GM',
				'CW,1',
				'CW,64',
				'ME,1',
				'NL,2',
				'MT,3',
				'SNL,1,2',
			]),
		)
		expect(context.updateStatus).toHaveBeenCalledWith(InstanceStatus.Ok, null)
		expect(context.subscribeActions).toHaveBeenCalled()
		expect(allValues(context)).toMatchObject({
			deviceType: 'Model-N',
			hostName: 'Dugan-N',
			firmwareSecVersion: '1.0',
			channelName49: 'Ch 49',
			sceneCount: 2,
			sceneActive: 'Sunday',
		})
		expect(instance.state.scenes.names).toEqual(['Sunday', 'Wedding'])
	})

	it('sends an action over the connection', async () => {
		const { instance, context } = createInstance()
		await instance.init(config())
		await connected(instance, context)
		await runAction(actions(context), ActionIdChannel.Weight, { channel: 7, weight: -4.5, query: false })
		await until(() => fake.texts().includes('CW,7,-4.5'))
		await until(() => allValues(context).channelWeight7 === -4.5)
	})

	it('steps a weight several times over, each building on the reply to the last', async () => {
		fake.replyDelay = 20
		const { instance, context } = createInstance()
		await instance.init(config())
		await connected(instance, context)
		const step = async () => runAction(actions(context), ActionIdChannel.WeightRelative, { channel: 2, weight: 1 })
		await Promise.all([step(), step(), step()])
		await until(() => allValues(context).channelWeight2 === 3)
		expect(fake.texts().filter((text) => text.startsWith('CW,2,'))).toEqual(['CW,2,1', 'CW,2,2', 'CW,2,3'])
	})

	it('takes in a change made elsewhere, and rechecks the feedbacks reading it', async () => {
		const { instance, context } = createInstance()
		await instance.init(config())
		await connected(instance, context)
		context.checkFeedbacks.mockClear()
		fake.broadcast('*BP,12,1')
		await until(() => context.checkFeedbacks.mock.calls.length > 0)
		// InstanceBase forwards the ids as one array
		expect(context.checkFeedbacks).toHaveBeenCalledWith([FeedbackId.ChannelBypass])
		expect(instance.state.channel(12)?.bypass).toBe(true)
	})

	it('asks for a feedback’s setting once on the connection, and turns unsolicited messages on for it', async () => {
		const { instance, context } = createInstance()
		await instance.init(config({ subscription: 0 }))
		await connected(instance, context)
		fake.settings.set('MXM,4', '1')
		expect(checkFeedback(feedbacks(context), FeedbackId.MatrixMuted, { matrix: 4 })).toBe(false)
		checkFeedback(feedbacks(context), FeedbackId.MatrixMuted, { matrix: 4 })
		await until(() => instance.state.matrix(4)?.mute === true)
		await until(() => fake.texts().includes('SU,1'))
		expect(fake.texts().filter((text) => text === 'MXM,4')).toHaveLength(1)
		expect(fake.texts()).toContain('SU,0')
	})

	it('polls the meters at the configured rate', async () => {
		const { instance, context } = createInstance()
		await instance.init(config({ meterRate: 250 }))
		await connected(instance, context)
		const before = fake.texts().filter((text) => text === 'GS').length
		await sleep(600)
		expect(fake.texts().filter((text) => text === 'GS').length - before).toBeGreaterThanOrEqual(2)
	})

	it('does not poll meters on a model that has none', async () => {
		fake.answers.set('SC', () => '*SC,5,MY16,1,1,1,1,00:00:00:00:00:00,127.0.0.1,255.0.0.0,127.0.0.1,0,16')
		fake.answers.set('CFN', () => '*CFN,16')
		const { instance, context } = createInstance()
		await instance.init(config({ meterRate: 250 }))
		await until(() => instance.model === 5)
		await until(() => 'groupMST3' in allValues(context))
		await sleep(400)
		expect(fake.texts()).not.toContain('GS')
		expect(instance.channelCount).toBe(16)
	})

	it('changes the messaging rate in place, but reconnects to a new address', async () => {
		const { instance, context } = createInstance()
		await instance.init(config())
		await connected(instance, context)
		await instance.configUpdated(config({ rate: 3 }))
		await sleep(50)
		expect(fake.connections).toBe(1)
		const state = instance.state
		await instance.configUpdated(config({ host: 'localhost' }))
		expect(instance.state).not.toBe(state)
		await until(() => fake.connections === 2)
		await until(() => fake.texts(2).includes('MT,3'))
	})

	it('ends the session when destroyed', async () => {
		const { instance, context } = createInstance()
		await instance.init(config())
		await connected(instance, context)
		await instance.destroy()
		await until(() => fake.texts().includes('QUIT'))
		expect(context.updateStatus).toHaveBeenLastCalledWith(InstanceStatus.Disconnected, null)
	})
})
