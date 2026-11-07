import { describe, expect, it } from 'vitest'
import { ReplyReader, type Frame } from '../api/reader.js'
import { BINARY_LENGTH, Code, MAX_LINE_LENGTH } from '../api/consts.js'
import { meterStatusBlock, matrixBulkBlock } from './fixtures.js'

const text = (value: string): Frame => ({ type: 'text', text: value })
const noise = (value: string): Frame => ({ type: 'noise', text: value })

function read(...chunks: (string | Buffer)[]): Frame[] {
	const reader = new ReplyReader()
	return chunks.flatMap((chunk) => reader.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'latin1')).frames)
}

describe('ReplyReader, text', () => {
	it('splits replies on line ends', () => {
		expect(read('*CM,1,2\r\n*CP,1,1\r\n')).toEqual([text('*CM,1,2'), text('*CP,1,1')])
	})

	it('splits replies sharing a line', () => {
		expect(read('*CM,1,2;*CM,2,0\r\n')).toEqual([text('*CM,1,2'), text('*CM,2,0')])
	})

	it('holds a reply cut between chunks until its end arrives', () => {
		expect(read('*CW,3,-', '2.5\r', '\n*BP,3,1\r\n')).toEqual([text('*CW,3,-2.5'), text('*BP,3,1')])
	})

	it('holds a partial header rather than guessing whether it is binary', () => {
		const reader = new ReplyReader()
		expect(reader.push(Buffer.from('*GS')).frames).toEqual([])
		expect(reader.push(Buffer.from('A,1\r\n')).frames).toEqual([text('*GSA,1')])
	})

	it('splits the welcome message and the prompt off as noise', () => {
		expect(read('Welcome to Dugan Model N Server.\r\nDugan N >*CM,1,2\r\nDugan N >')).toEqual([
			noise('Welcome to Dugan Model N Server.'),
			noise('Dugan N >'),
			text('*CM,1,2'),
		])
	})

	it('keeps a prompt with no line end until it knows what follows', () => {
		const reader = new ReplyReader()
		expect(reader.push(Buffer.from('Dugan N >')).frames).toEqual([])
		expect(reader.push(Buffer.from('*SU,1\r\n')).frames).toEqual([noise('Dugan N >'), text('*SU,1')])
	})

	it('drops an overlong line with no end', () => {
		const reader = new ReplyReader()
		const result = reader.push(Buffer.from('*' + 'x'.repeat(MAX_LINE_LENGTH + 1)))
		expect(result).toEqual({ frames: [], dropped: MAX_LINE_LENGTH + 2 })
		expect(reader.push(Buffer.from('*CM,1,1\r\n')).frames).toEqual([text('*CM,1,1')])
	})
})

describe('ReplyReader, binary', () => {
	it('takes a binary reply whole, though its bytes include line ends and separators', () => {
		// 13, 10 and 59 in the meters are CR, LF and ;
		const block = meterStatusBlock({ automixGain: { 1: 13, 2: 10, 3: 59, 4: 42 } })
		const [frame, ...rest] = read(block)
		expect(rest).toEqual([])
		expect(frame).toMatchObject({ type: 'binary', code: Code.MeterStatus })
		expect(frame.type === 'binary' && frame.data.equals(block)).toBe(true)
	})

	it('waits for a binary reply split across chunks', () => {
		const block = matrixBulkBlock({ gains: { 1: 200 } })
		const reader = new ReplyReader()
		expect(reader.push(block.subarray(0, 300)).frames).toEqual([])
		expect(reader.push(block.subarray(300, 700)).frames).toEqual([])
		const [frame] = reader.push(block.subarray(700)).frames
		expect(frame.type === 'binary' && frame.data.equals(block)).toBe(true)
	})

	it('drops the rest of the chunk a binary reply ends in, as the 1.x module did', () => {
		const block = meterStatusBlock()
		const [frame, ...rest] = read(Buffer.concat([block, Buffer.from('\r\nDugan N >')]))
		expect(rest).toEqual([])
		expect(frame).toMatchObject({ type: 'binary', tail: 11 })
	})

	it('reads text before a binary reply in the same chunk', () => {
		const frames = read(Buffer.concat([Buffer.from('*SU,1\r\nDugan N >'), meterStatusBlock()]))
		expect(frames.map((frame) => frame.type)).toEqual(['text', 'noise', 'binary'])
	})

	it('reads replies again in the chunk after a binary reply', () => {
		const reader = new ReplyReader()
		reader.push(meterStatusBlock())
		expect(reader.push(Buffer.from('*CM,1,2\r\n')).frames).toEqual([text('*CM,1,2')])
	})

	it('drops a binary reply that will not be finished, so the replies after it are read', () => {
		const reader = new ReplyReader()
		reader.push(meterStatusBlock().subarray(0, 100))
		expect(reader.dropIncompleteBinary()).toBe(100)
		expect(reader.push(Buffer.from('*CM,1,2\r\n')).frames).toEqual([text('*CM,1,2')])
	})

	it('drops nothing when no binary reply is waiting', () => {
		const reader = new ReplyReader()
		reader.push(Buffer.from('*CM,1'))
		expect(reader.dropIncompleteBinary()).toBe(0)
		expect(reader.push(Buffer.from(',2\r\n')).frames).toEqual([text('*CM,1,2')])
	})

	it('has a length for every binary code', () => {
		expect(Object.keys(BINARY_LENGTH).sort()).toEqual([Code.ChannelBulk, Code.MatrixBulk, Code.MeterStatus].sort())
	})
})
