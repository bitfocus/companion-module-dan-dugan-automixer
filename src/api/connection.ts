import { EventEmitter } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { InstanceStatus, TCPHelper, type LogLevel } from '@companion-module/base'
import PQueue from 'p-queue'
import {
	BINARY_CODES,
	Code,
	EOM,
	ERROR_PREFIX,
	MESSAGE_GAP_MS,
	MISSED_REPLIES_WARNING,
	Priority,
	REPLY_TIMEOUT_MS,
} from './consts.js'
import { decodeBinary, decodeText, splitReply, type Reply } from './decode.js'
import type { Command, ReplyMatch } from './messages.js'
import { ReplyReader, type Frame } from './reader.js'
import { errorMessage } from '../util.js'

export interface ConnectionTiming {
	/** Least time from sending one message to sending the next */
	messageGap: number
	/** Longest wait for the reply to a message before sending the next anyway */
	replyTimeout: number
	/** How long TCPHelper waits before reconnecting */
	reconnectInterval: number
}

export const DEFAULT_TIMING: ConnectionTiming = {
	messageGap: MESSAGE_GAP_MS[1],
	replyTimeout: REPLY_TIMEOUT_MS,
	reconnectInterval: 2000,
}

export interface ConnectionOptions {
	host: string
	port: number
	log: (level: LogLevel, message: string) => void
	/** Defaults to {@link DEFAULT_TIMING}. Tests shorten it */
	timing?: Partial<ConnectionTiming>
}

export interface ConnectionEvents {
	/** A connection has opened. Fires again on every reconnection */
	connected: []
	/** The open connection has closed or failed. TCPHelper tries again by itself */
	disconnected: []
	/** Anything the unit sent, decoded */
	reply: [reply: Reply]
	status: [status: InstanceStatus, message: string | null]
}

/**
 * A command, or a function giving one when it is about to be sent. The function is for commands worked out from the
 * unit's state, a toggle or a relative change, so that one queued behind another builds on the reply to it. It
 * returns undefined to send nothing after all.
 */
export type CommandSource = Command | (() => Command | undefined)

/** Whether a reply is the one a command is waiting for */
export function matchesReply(match: ReplyMatch, frame: Frame): boolean {
	if (frame.type === 'noise') return false
	if (frame.type === 'binary') return match.codes.includes(frame.code)
	const { code, params } = splitReply(frame.text)
	if (!match.codes.includes(code)) return false
	if (match.index === undefined || params.length === 0) return true
	// An error says what was wrong rather than echoing the index
	return ERROR_PREFIX.test(params[0].trim()) || Number(params[0]) === match.index
}

/** Resolves true if the promise settles within the time, false if not */
async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
	let timer: NodeJS.Timeout | undefined
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), ms)
	})
	try {
		return await Promise.race([promise.then(() => true), timeout])
	} finally {
		clearTimeout(timer)
	}
}

/** The reply the line is being held for */
interface Awaiting {
	readonly match: ReplyMatch
	readonly text: string
	readonly resolve: () => void
}

/**
 * The TCP connection to a Dugan unit: framing, pacing and reconnection. Knows nothing of Companion beyond reporting a
 * status for it.
 *
 * One message is sent at a time. After each the line is held until the unit has answered it, or the reply timeout has
 * passed, and in any case for at least the message gap: the units have crashed when sent messages too fast.
 */
export class DuganConnection extends EventEmitter<ConnectionEvents> {
	readonly #options: ConnectionOptions
	readonly #timing: ConnectionTiming
	readonly #queue = new PQueue({ concurrency: 1 })
	readonly #reader = new ReplyReader()
	#socket: TCPHelper | undefined
	/** Exists while a connection is open, and is aborted as it closes, which drops everything queued for it */
	#session: AbortController | undefined
	/** Settles once the unit may be sent the next message */
	#lineClear: Promise<void> = Promise.resolve()
	#awaiting: Awaiting | undefined
	#missedReplies = 0
	/** Set by the first failure of an outage, so retries against a unit that is off don't flood the log */
	#outageLogged = false
	#lastStatus: { status: InstanceStatus; message: string | null } | undefined
	#destroyed = false

	constructor(options: ConnectionOptions) {
		super()
		this.#options = options
		this.#timing = { ...DEFAULT_TIMING, ...options.timing }
	}

	get isConnected(): boolean {
		return this.#session !== undefined
	}

	/** Messages waiting to be sent, not counting the one being sent */
	get queued(): number {
		return this.#queue.size
	}

	/** Changes the gap from the next message on, as when the messaging rate is changed in the config */
	set messageGap(ms: number) {
		this.#timing.messageGap = ms
	}

	connect(): void {
		if (this.#destroyed) throw new Error('Connection has been destroyed')
		if (this.#socket) return
		const { host, port } = this.#options
		this.#options.log('debug', `Connecting to ${host}:${port}`)
		this.#status(InstanceStatus.Connecting, null)
		const socket = new TCPHelper(host, port, { reconnect_interval: this.#timing.reconnectInterval })
		this.#socket = socket
		socket.on('status_change', (status, message) => {
			// Ok is reported once the session has started, by #open
			if (status !== InstanceStatus.Ok) this.#status(status, message ?? null)
		})
		socket.on('connect', () => this.#open())
		socket.on('data', (chunk) => this.#receive(chunk))
		socket.on('end', () => {
			this.#logOutage(`Connection closed by ${host}:${port}`)
			this.#close()
		})
		socket.on('error', (err) => {
			this.#logOutage(`Network error: ${err.message}`)
			this.#close()
			this.#status(InstanceStatus.ConnectionFailure, err.message)
		})
	}

	/** Ends the session and closes the connection for good. Anything still queued is rejected */
	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		this.removeAllListeners()
		const socket = this.#socket
		if (socket?.isConnected) {
			// Straight to the socket, past the queue: nothing else will be sent
			try {
				socket.send(Code.EndSession + EOM)
			} catch (err) {
				this.#options.log('debug', `Could not end session: ${errorMessage(err)}`)
			}
		}
		this.#close()
		socket?.destroy()
		this.#socket = undefined
	}

	/**
	 * Queues a command for the unit
	 * @param signal an action's context.signal. A command whose signal aborts before its turn is never sent
	 * @returns once the command is written to the socket, or straight away if its source gave none
	 * @throws if there is no connection, or it closes or the signal aborts before the command is sent
	 */
	async send(source: CommandSource, priority: Priority = Priority.Background, signal?: AbortSignal): Promise<void> {
		const session = this.#session
		if (session === undefined) throw new Error('Not connected')
		signal?.throwIfAborted()
		// p-queue listens on the combined signal from the moment the job is queued, which makes it pass an abort on
		// eagerly. Only reading .aborted could miss one: AbortSignal.any holds its sources weakly
		const combined = signal ? AbortSignal.any([session.signal, signal]) : session.signal
		await this.#queue.add(async ({ signal: jobSignal }) => this.#transmit(source, jobSignal), {
			priority,
			signal: combined,
		})
	}

	async #transmit(source: CommandSource, signal: AbortSignal | undefined): Promise<void> {
		// The wait is here, at the start of a job, rather than at the end of the one before. p-queue starts the next job as
		// soon as a running job's signal aborts, and the unit must still get its gap and its chance to reply
		await this.#lineClear
		signal?.throwIfAborted()
		const socket = this.#socket
		if (!socket?.isConnected || this.#session === undefined) throw new Error('Not connected')
		const command = typeof source === 'function' ? source() : source
		if (command === undefined) return
		this.#holdLine(command)
		this.#options.log('debug', `Sending ${command.text}`)
		try {
			if (!(await socket.sendAsync(command.text + EOM))) throw new Error('Not connected')
		} catch (err) {
			// No reply is coming to a message that never went
			this.#releaseLine()
			throw err
		}
	}

	/** Called just before a message goes, so a reply can't arrive before anything is waiting for it */
	#holdLine(command: Command): void {
		const { promise, resolve } = Promise.withResolvers<void>()
		this.#awaiting = { match: command.reply, text: command.text, resolve }
		const { messageGap, replyTimeout } = this.#timing
		this.#lineClear = Promise.all([
			sleep(messageGap),
			settlesWithin(promise, replyTimeout).then((replied) => {
				if (replied) return
				this.#timedOut(command)
			}),
		]).then(() => undefined)
	}

	#releaseLine(): void {
		this.#awaiting?.resolve()
		this.#awaiting = undefined
	}

	#timedOut(command: Command): void {
		if (this.#awaiting?.text === command.text) this.#awaiting = undefined
		if (this.#session === undefined) return
		this.#options.log('debug', `No reply to ${command.text} within ${this.#timing.replyTimeout} ms, sending on`)
		// A binary reply cut short would swallow the replies after it
		if (command.reply.codes.some((code) => BINARY_CODES.includes(code))) {
			const dropped = this.#reader.dropIncompleteBinary()
			if (dropped > 0) this.#options.log('warn', `Dropped ${dropped} bytes of an incomplete ${command.text} reply`)
		}
		this.#missedReplies++
		if (this.#missedReplies === MISSED_REPLIES_WARNING) {
			this.#options.log('warn', `No reply to the last ${MISSED_REPLIES_WARNING} messages`)
			this.#status(InstanceStatus.UnknownWarning, 'Unit not replying')
		}
	}

	#open(): void {
		this.#close()
		const { host, port } = this.#options
		this.#session = new AbortController()
		this.#reader.reset()
		this.#lineClear = Promise.resolve()
		this.#missedReplies = 0
		this.#outageLogged = false
		this.#options.log('info', `Connected to ${host}:${port}`)
		this.#status(InstanceStatus.Ok, null)
		this.emit('connected')
	}

	/** Ends the session, if one is open: everything queued for it is rejected */
	#close(): void {
		const session = this.#session
		if (session === undefined) return
		this.#session = undefined
		session.abort(new Error('Connection closed'))
		this.#releaseLine()
		this.#lineClear = Promise.resolve()
		this.#reader.reset()
		this.emit('disconnected')
	}

	/** Logs the first failure of an outage as a warning, and the retries after it only for debugging */
	#logOutage(message: string): void {
		this.#options.log(this.#outageLogged ? 'debug' : 'warn', message)
		this.#outageLogged = true
	}

	#receive(chunk: Buffer): void {
		if (this.#session === undefined) return
		const { frames, dropped } = this.#reader.push(chunk)
		if (dropped > 0) this.#options.log('warn', `Dropped ${dropped} bytes with no end of message`)
		for (const frame of frames) this.#handleFrame(frame)
	}

	#handleFrame(frame: Frame): void {
		try {
			if (frame.type === 'noise') {
				this.#options.log('debug', `Received ${frame.text}`)
				return
			}
			const awaiting = this.#awaiting
			if (awaiting && matchesReply(awaiting.match, frame)) {
				this.#releaseLine()
				if (this.#missedReplies >= MISSED_REPLIES_WARNING) this.#status(InstanceStatus.Ok, null)
				this.#missedReplies = 0
			}
			const reply = frame.type === 'binary' ? decodeBinary(frame.code, frame.data) : decodeText(frame.text)
			this.emit('reply', reply)
		} catch (err) {
			// This runs in the socket's data listener, where a throw would end the module's process
			const what = frame.type === 'binary' ? `${frame.code} reply` : JSON.stringify(frame.text)
			this.#options.log('error', `Could not handle ${what}: ${errorMessage(err)}`)
		}
	}

	#status(status: InstanceStatus, message: string | null): void {
		if (this.#lastStatus?.status === status && this.#lastStatus.message === message) return
		this.#lastStatus = { status, message }
		this.emit('status', status, message)
	}
}
