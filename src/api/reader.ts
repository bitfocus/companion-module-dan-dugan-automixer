import { BINARY_HEADER_LENGTH, BINARY_HEADERS, BINARY_LENGTH, MAX_LINE_LENGTH, type BinaryCode } from './consts.js'

/** One message from the unit */
export type Frame =
	/** A text reply, from its SOM to the end of its line or the next REPLY_SEP, trimmed */
	| { type: 'text'; text: string }
	/**
	 * A binary reply, header included, as {@link BINARY_LENGTH} long
	 * @property tail how many bytes after it were dropped, the rest of the chunk it ended in
	 */
	| { type: 'binary'; code: BinaryCode; data: Buffer; tail: number }
	/** A line of text outside any reply, such as the welcome message or the prompt, trimmed */
	| { type: 'noise'; text: string }

export interface ReadResult {
	frames: Frame[]
	/** Bytes dropped from an overlong line with no end */
	dropped: number
}

const SOM_BYTE = 0x2a // *
const CR = 0x0d
const LF = 0x0a
const REPLY_SEP_BYTE = 0x3b // ;

function isLineEnd(byte: number): boolean {
	return byte === CR || byte === LF
}

function indexOfReplyEnd(buffer: Buffer): number {
	return buffer.findIndex((byte) => isLineEnd(byte) || byte === REPLY_SEP_BYTE)
}

function lastIndexOfLineEnd(buffer: Buffer): number {
	return buffer.findLastIndex(isLineEnd)
}

function binaryCode(buffer: Buffer): BinaryCode | undefined {
	const header = buffer.toString('latin1', 0, BINARY_HEADER_LENGTH)
	return Object.hasOwn(BINARY_HEADERS, header) ? BINARY_HEADERS[header] : undefined
}

/**
 * Splits what the unit sends into replies. TCP delivers it in chunks that need not line up with messages, so anything
 * incomplete is held for the next chunk.
 *
 * Text replies end at a line end or REPLY_SEP. The prompt has no line end, so text before a reply on the same line is
 * split off as noise. A binary reply can't be split on line ends, as its bytes can be anything: see
 * {@link BINARY_LENGTH} for how it is framed.
 */
export class ReplyReader {
	#buffer: Buffer = Buffer.alloc(0)

	push(chunk: Buffer): ReadResult {
		let buffer = this.#buffer.length > 0 ? Buffer.concat([this.#buffer, chunk]) : chunk
		const frames: Frame[] = []
		let dropped = 0
		while (buffer.length > 0) {
			const start = buffer.indexOf(SOM_BYTE)
			if (start === -1) {
				// No reply here. Whole lines are noise. A partial one is kept, as a reply may follow it on the same line
				const end = lastIndexOfLineEnd(buffer)
				if (end === -1) {
					if (buffer.length > MAX_LINE_LENGTH) {
						dropped += buffer.length
						buffer = Buffer.alloc(0)
					}
					break
				}
				pushNoise(frames, buffer.subarray(0, end + 1))
				buffer = buffer.subarray(end + 1)
				continue
			}
			if (start > 0) {
				pushNoise(frames, buffer.subarray(0, start))
				buffer = buffer.subarray(start)
				continue
			}

			const end = indexOfReplyEnd(buffer)
			// Too short to tell a binary header from text, and not ended, so more is coming
			if (buffer.length < BINARY_HEADER_LENGTH && end === -1) break
			const code = binaryCode(buffer)
			if (code !== undefined) {
				const length = BINARY_LENGTH[code]
				if (buffer.length < length) break
				frames.push({
					type: 'binary',
					code,
					data: Buffer.from(buffer.subarray(0, length)),
					tail: buffer.length - length,
				})
				// Anything before the block was handled on an earlier pass, so all that's left is this chunk's tail
				buffer = Buffer.alloc(0)
				break
			}
			if (end === -1) {
				if (buffer.length > MAX_LINE_LENGTH) {
					dropped += buffer.length
					buffer = Buffer.alloc(0)
				}
				break
			}
			const text = buffer.toString('utf8', 0, end).trim()
			frames.push({ type: 'text', text })
			buffer = buffer.subarray(end + 1)
		}
		// A copy, so a small remainder doesn't keep a whole chunk alive
		this.#buffer = Buffer.from(buffer)
		return { frames, dropped }
	}

	/**
	 * Drops a binary reply still waiting for the rest of its bytes. For when the wait for it has timed out: otherwise the
	 * replies that follow would be read as the rest of it.
	 * @returns how many bytes were dropped
	 */
	dropIncompleteBinary(): number {
		if (this.#buffer.length < BINARY_HEADER_LENGTH || binaryCode(this.#buffer) === undefined) return 0
		const dropped = this.#buffer.length
		this.#buffer = Buffer.alloc(0)
		return dropped
	}

	reset(): void {
		this.#buffer = Buffer.alloc(0)
	}
}

function pushNoise(frames: Frame[], bytes: Buffer): void {
	for (const line of bytes.toString('utf8').split(/[\r\n]+/)) {
		const text = line.trim()
		if (text !== '') frames.push({ type: 'noise', text })
	}
}
