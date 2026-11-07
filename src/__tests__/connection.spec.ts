import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { InstanceStatus, type LogLevel } from '@companion-module/base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DuganConnection, matchesReply, type ConnectionTiming } from '../api/connection.js'
import { Code, Priority } from '../api/consts.js'
import { channelQuery, channelSet, command } from '../api/messages.js'
import type { Reply } from '../api/decode.js'
import { FakeDugan, closedPort } from './fakeDugan.js'
import { meterStatusBlock } from './fixtures.js'

let fake: FakeDugan
const connections: DuganConnection[] = []

beforeEach(async () => {
	fake = new FakeDugan()
	await fake.listen()
})

afterEach(async () => {
	for (const connection of connections.splice(0)) connection.destroy()
	await fake.close()
})

function create(timing: Partial<ConnectionTiming> = {}, port = fake.port) {
	const log = vi.fn<(level: LogLevel, message: string) => void>()
	const connection = new DuganConnection({
		host: '127.0.0.1',
		port,
		log,
		timing: { messageGap: 10, replyTimeout: 300, reconnectInterval: 50, ...timing },
	})
	const replies: Reply[] = []
	const statuses: [InstanceStatus, string | null][] = []
	connection.on('reply', (reply) => replies.push(reply))
	connection.on('status', (status, message) => statuses.push([status, message]))
	connections.push(connection)
	return { connection, log, replies, statuses }
}

async function connected(timing: Partial<ConnectionTiming> = {}) {
	const created = create(timing)
	const opened = once(created.connection, 'connected')
	created.connection.connect()
	await opened
	return created
}

async function until(condition: () => boolean, timeout = 2000): Promise<void> {
	const start = Date.now()
	while (!condition()) {
		if (Date.now() - start > timeout) throw new Error('timed out waiting')
		await sleep(5)
	}
}

/** ms from one received line to the next */
const gap = (first: number, second: number) => fake.received[second].at - fake.received[first].at

describe('DuganConnection', () => {
	it('connects, reports Ok, and passes on replies but not the welcome or prompt', async () => {
		const { connection, replies, statuses } = await connected()
		expect(connection.isConnected).toBe(true)
		expect(statuses.at(-1)).toEqual([InstanceStatus.Ok, null])
		await connection.send(channelSet(Code.ChannelMode, 1, 2))
		await until(() => replies.length === 1)
		expect(replies).toEqual([{ type: 'channel', field: 'mode', channel: 1, value: 2 }])
	})

	it('waits for the reply to a message before sending the next', async () => {
		fake.replyDelay = 120
		const { connection } = await connected({ replyTimeout: 1000 })
		await Promise.all([
			connection.send(channelQuery(Code.ChannelMode, 1)),
			connection.send(channelQuery(Code.ChannelMode, 2)),
		])
		await until(() => fake.received.length === 2)
		expect(gap(0, 1)).toBeGreaterThanOrEqual(110)
	})

	it('sends on once the reply timeout has passed without one', async () => {
		fake.answering = false
		const { connection, log } = await connected({ replyTimeout: 150 })
		void connection.send(command(Code.SceneCount))
		void connection.send(command(Code.SceneActive))
		await until(() => fake.received.length === 2)
		expect(gap(0, 1)).toBeGreaterThanOrEqual(140)
		expect(log).toHaveBeenCalledWith('debug', 'No reply to SNC within 150 ms, sending on')
	})

	it('keeps the message gap even when the reply is immediate', async () => {
		const { connection } = await connected({ messageGap: 100 })
		void connection.send(command(Code.SceneCount))
		void connection.send(command(Code.SceneActive))
		await until(() => fake.received.length === 2)
		expect(gap(0, 1)).toBeGreaterThanOrEqual(95)
	})

	it('does not take a reply under another code as the one it is waiting for', async () => {
		fake.replyDelay = 200
		const { connection } = await connected({ replyTimeout: 1000 })
		void connection.send(channelQuery(Code.ChannelMode, 1))
		void connection.send(channelQuery(Code.ChannelMode, 2))
		await until(() => fake.received.length === 1)
		fake.broadcast('*BP,5,1')
		await until(() => fake.received.length === 2)
		expect(gap(0, 1)).toBeGreaterThanOrEqual(190)
	})

	it('does not take a reply about another channel as the one it is waiting for', async () => {
		fake.replyDelay = 200
		const { connection } = await connected({ replyTimeout: 1000 })
		void connection.send(channelQuery(Code.ChannelMode, 1))
		void connection.send(channelQuery(Code.ChannelMode, 2))
		await until(() => fake.received.length === 1)
		fake.broadcast('*CM,9,0')
		await until(() => fake.received.length === 2)
		expect(gap(0, 1)).toBeGreaterThanOrEqual(190)
	})

	it('takes an error as the reply', async () => {
		fake.answers.set('CM', () => '*CM,Error: syntax')
		const { connection, replies } = await connected({ replyTimeout: 1000 })
		void connection.send(channelQuery(Code.ChannelMode, 1))
		void connection.send(command(Code.SceneCount))
		await until(() => fake.received.length === 2)
		expect(gap(0, 1)).toBeLessThan(500)
		expect(replies[0]).toEqual({ type: 'error', code: 'CM', message: 'Error: syntax' })
	})

	it('builds a command from a function when its turn comes, after the reply before it', async () => {
		fake.replyDelay = 50
		const { connection } = await connected({ replyTimeout: 1000 })
		let weight = 0
		connection.on('reply', (reply) => {
			if (reply.type === 'channel' && reply.field === 'weight') weight = reply.value
		})
		void connection.send(channelSet(Code.ChannelWeight, 1, 5))
		await connection.send(() => channelSet(Code.ChannelWeight, 1, weight + 1))
		await until(() => fake.received.length === 2)
		expect(fake.texts()).toEqual(['CW,1,5', 'CW,1,6'])
	})

	it('sends nothing for a function that gives no command', async () => {
		const { connection } = await connected()
		await connection.send(() => undefined)
		await connection.send(command(Code.SceneCount))
		await until(() => fake.received.length === 1)
		await sleep(30)
		expect(fake.texts()).toEqual(['SNC'])
	})

	it('sends actions ahead of background messages', async () => {
		fake.replyDelay = 30
		const { connection } = await connected({ replyTimeout: 1000 })
		const sent = [
			connection.send(command(Code.SceneCount)),
			connection.send(command(Code.SceneActive)),
			connection.send(command(Code.SystemConfig)),
			connection.send(channelSet(Code.ChannelMode, 1, 0), Priority.Action),
		]
		await Promise.all(sent)
		await until(() => fake.received.length === 4)
		expect(fake.texts()).toEqual(['SNC', 'CM,1,0', 'SNA', 'SC'])
	})

	it('drops a message whose signal aborts before its turn', async () => {
		fake.replyDelay = 100
		const { connection } = await connected({ replyTimeout: 1000 })
		const controller = new AbortController()
		const first = connection.send(command(Code.SceneCount))
		const second = connection.send(command(Code.SceneActive), Priority.Background, controller.signal)
		controller.abort(new Error('not wanted'))
		await first
		await expect(second).rejects.toThrow('not wanted')
		await sleep(150)
		expect(fake.texts()).toEqual(['SNC'])
	})

	it('refuses to queue while not connected', async () => {
		const { connection } = create()
		await expect(connection.send(command(Code.SceneCount))).rejects.toThrow('Not connected')
	})

	it('rejects what is queued when the connection drops, and reconnects', async () => {
		fake.answering = false
		const { connection } = await connected({ replyTimeout: 1000 })
		void connection.send(command(Code.SceneCount))
		const queued = connection.send(command(Code.SceneActive))
		await until(() => fake.received.length === 1)
		const reopened = once(connection, 'connected')
		fake.dropConnections()
		await expect(queued).rejects.toThrow()
		await reopened
		// The client can hear it has connected before the server has run its accept callback
		await until(() => fake.connections === 2)
		expect(fake.texts()).toEqual(['SNC'])
	})

	it('reports a connection failure, and logs only the first of an outage', async () => {
		const { connection, log, statuses } = create({ reconnectInterval: 20 }, await closedPort())
		connection.connect()
		await until(() => log.mock.calls.filter(([level]) => level === 'debug').length >= 2)
		expect(statuses).toContainEqual([InstanceStatus.ConnectionFailure, expect.stringContaining('ECONNREFUSED')])
		expect(log.mock.calls.filter(([level]) => level === 'warn')).toHaveLength(1)
	})

	it('ends the session on destroy', async () => {
		const { connection } = await connected()
		connection.destroy()
		await until(() => fake.texts().includes('QUIT'))
		await until(() => fake.openConnections === 0)
	})

	it('says so when the unit stops replying, and that it is back when it replies', async () => {
		fake.answering = false
		const { connection, statuses } = await connected({ replyTimeout: 30 })
		for (let i = 0; i < 3; i++) void connection.send(command(Code.SceneCount))
		await until(() => statuses.at(-1)?.[0] === InstanceStatus.UnknownWarning)
		fake.answering = true
		await connection.send(command(Code.SceneCount))
		await until(() => statuses.at(-1)?.[0] === InstanceStatus.Ok)
	})

	it('decodes a binary reply', async () => {
		fake.answers.set('GS', () => meterStatusBlock({ automixGain: { 1: 4 } }))
		const { connection, replies } = await connected()
		await connection.send(command(Code.MeterStatus))
		await until(() => replies.length === 1)
		expect(replies[0]).toMatchObject({ type: 'meterStatus', status: { automixGain: expect.arrayContaining([-2]) } })
	})

	it('drops a binary reply that is never finished, so the replies after it are read', async () => {
		fake.answers.set('GS', () => meterStatusBlock().subarray(0, 100))
		const { connection, replies, log } = await connected({ replyTimeout: 100 })
		void connection.send(command(Code.MeterStatus))
		await connection.send(channelQuery(Code.ChannelMode, 3))
		await until(() => replies.length === 1)
		expect(replies).toEqual([{ type: 'channel', field: 'mode', channel: 3, value: 0 }])
		expect(log).toHaveBeenCalledWith('warn', expect.stringMatching(/^Dropped \d+ bytes of an incomplete GS reply$/))
	})
})

describe('matchesReply', () => {
	const match = { codes: ['CM'], index: 2 }
	it('matches the code and index, or an error under the code', () => {
		expect(matchesReply(match, { type: 'text', text: '*CM,2,1' })).toBe(true)
		expect(matchesReply(match, { type: 'text', text: '*CM,3,1' })).toBe(false)
		expect(matchesReply(match, { type: 'text', text: '*CP,2,1' })).toBe(false)
		expect(matchesReply(match, { type: 'text', text: '*CM,Error: syntax' })).toBe(true)
		expect(matchesReply(match, { type: 'noise', text: 'Dugan N >' })).toBe(false)
	})

	it('matches a binary reply by code', () => {
		const data = meterStatusBlock()
		expect(matchesReply({ codes: ['GS'] }, { type: 'binary', code: Code.MeterStatus, data, tail: 0 })).toBe(true)
		expect(matchesReply({ codes: ['GM'] }, { type: 'binary', code: Code.MeterStatus, data, tail: 0 })).toBe(false)
	})
})
