import { createServer, type Server, type Socket } from 'node:net'
import { meterStatusBlock, matrixBulkBlock } from './fixtures.js'

/** What the fake sends for a command: a reply, several, raw bytes, or nothing */
export type Answer = string | string[] | Buffer | undefined

/**
 * A Dugan unit on a loopback TCP port, for the module to connect to.
 *
 * There is no protocol document or capture from a unit to work from. The welcome message, the prompt with no line end,
 * and each reply are in the formats the 1.x module parsed when used against Model M and N units. Everything here is
 * written out by hand rather than taken from the module under test.
 */
export class FakeDugan {
	/** Every line received, in order */
	readonly received: { at: number; connection: number; text: string }[] = []
	/** Settings as last set, by command and index: "CW,3" is channel 3's weight */
	readonly settings = new Map<string, string>()
	/** Replaces the answer to a command code */
	readonly answers = new Map<string, (params: string[]) => Answer>()
	port = 0
	connections = 0
	/** Delay before each reply */
	replyDelay = 0
	/** Off, the socket stays open but nothing is answered, as when a unit hangs */
	answering = true
	/** Sent after each reply, as the telnet port does */
	prompt = 'Dugan N >'
	readonly #server: Server
	readonly #sockets = new Set<Socket>()
	readonly #buffers = new Map<Socket, string>()
	readonly #timers = new Set<NodeJS.Timeout>()

	constructor() {
		this.#server = createServer((socket) => {
			this.connections++
			const connection = this.connections
			this.#sockets.add(socket)
			this.#buffers.set(socket, '')
			socket.write(`Welcome to Dugan Model N Server.\r\n${this.prompt}`)
			socket.on('data', (chunk: Buffer) => this.#onData(socket, connection, chunk))
			socket.on('close', () => {
				this.#sockets.delete(socket)
				this.#buffers.delete(socket)
			})
			socket.on('error', () => {})
		})
	}

	async listen(): Promise<void> {
		await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', resolve))
		const address = this.#server.address()
		if (!address || typeof address === 'string') throw new Error('fake unit did not get a port')
		this.port = address.port
	}

	async close(): Promise<void> {
		for (const timer of this.#timers) clearTimeout(timer)
		this.dropConnections()
		await new Promise<void>((resolve) => this.#server.close(() => resolve()))
	}

	get openConnections(): number {
		return this.#sockets.size
	}

	dropConnections(): void {
		for (const socket of this.#sockets) socket.destroy()
	}

	/** Writes to every connection, as is */
	broadcastRaw(data: string | Uint8Array): void {
		for (const socket of this.#sockets) socket.write(data)
	}

	/** Sends an unsolicited reply to every connection */
	broadcast(text: string): void {
		this.broadcastRaw(`${text}\r\n${this.prompt}`)
	}

	/** The text of every line received, optionally only those on one connection */
	texts(connection?: number): string[] {
		return this.received.filter((m) => connection === undefined || m.connection === connection).map((m) => m.text)
	}

	#onData(socket: Socket, connection: number, chunk: Buffer): void {
		let buffer = (this.#buffers.get(socket) ?? '') + chunk.toString('latin1')
		let end: number
		while ((end = buffer.indexOf('\r\n')) !== -1) {
			const text = buffer.slice(0, end)
			buffer = buffer.slice(end + 2)
			this.received.push({ at: performance.now(), connection, text })
			this.#answer(socket, text)
		}
		this.#buffers.set(socket, buffer)
	}

	#answer(socket: Socket, text: string): void {
		const [code, ...params] = text.split(',')
		if (code === 'QUIT') {
			socket.end()
			return
		}
		if (!this.answering) return
		const custom = this.answers.get(code)
		const answer = custom ? custom(params) : this.#default(code, params)
		if (answer === undefined) return
		const data = Buffer.isBuffer(answer)
			? Buffer.concat([answer, Buffer.from(`\r\n${this.prompt}`)])
			: Buffer.from(`${[answer].flat().join('\r\n')}\r\n${this.prompt}`, 'latin1')
		const send = () => {
			if (!socket.destroyed) socket.write(data)
		}
		if (this.replyDelay === 0) {
			send()
			return
		}
		const timer = setTimeout(() => {
			this.#timers.delete(timer)
			send()
		}, this.replyDelay)
		this.#timers.add(timer)
	}

	/** Echoes a set, and answers a query with the setting last set, or 0 */
	#default(code: string, params: string[]): Answer {
		switch (code) {
			case 'SC':
				return '*SC,12,Dugan-N,N01234,2.1,7,3,00:1D:C1:00:00:01,127.0.0.1,255.0.0.0,127.0.0.1,0,64'
			case 'VE':
				return '*VE,2.1,1.0,7,3'
			case 'HW':
				return '*HW,HB:1,LWIP:2,DSP:3,TCPIP:4,MACRX:5,MACTX:6,RTOS:7,MALLOC:8'
			case 'CC':
				return '*CC,UDP:0,TCP:1'
			case 'SNC':
				return '*SNC,2'
			case 'SNL':
				return '*SNL,1,2,2,Sunday,Wedding'
			case 'SNA':
				return '*SNA,Sunday,1,0'
			case 'CNS': {
				const [first, count] = params.map(Number)
				const names = Array.from({ length: count }, (_, i) => this.settings.get(`CN,${first + i}`) ?? `Ch ${first + i}`)
				return `*CNS,${first},${count},${names.join(',')}`
			}
			case 'GS':
				return meterStatusBlock()
			case 'GM':
				return matrixBulkBlock()
		}
		// A group mask, or a system setting, has no index
		const indexed = ![
			'SM',
			'SP',
			'SO',
			'LH',
			'SU',
			'LG',
			'CS',
			'AM',
			'CFN',
			'CFS',
			'BM',
			'DH',
			'HR',
			'SF',
			'MM',
		].includes(code)
		const [index, ...values] = indexed ? params : ['', ...params]
		const key = indexed ? `${code},${index}` : code
		if (values.length > 0) {
			this.settings.set(key, values.join(','))
			return `*${[code, ...params].join(',')}`
		}
		const value = this.settings.get(key) ?? (code === 'CFN' ? '64' : '0')
		return indexed ? `*${code},${index},${value}` : `*${code},${value}`
	}
}

/** A port nothing is listening on */
export async function closedPort(): Promise<number> {
	const server = createServer()
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	await new Promise<void>((resolve) => server.close(() => resolve()))
	if (!address || typeof address === 'string') throw new Error('no port')
	return address.port
}
