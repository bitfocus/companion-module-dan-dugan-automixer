import type { CompanionActionDefinitions } from '@companion-module/base'
import {
	Code,
	MATRIX_INPUTS,
	MAX_MATRIX_OUTPUT,
	crosspointQuery,
	crosspointSet,
	isMatrix,
	isWhole,
	matrixQuery,
	matrixSet,
	type MatrixCode,
} from '../api/index.js'
import type ModuleInstance from '../main.js'
import {
	MATRIX_MUTE_CHOICES,
	POLARITY_CHOICES,
	clamp,
	matrixInputChoices,
	matrixOption,
	matrixOutputChoices,
	queryOption,
	queryOptionFor,
	resolveToggle,
	type DefinitionContext,
	type OffOnToggle,
} from '../options.js'
import { CROSSPOINT_RANGE, MATRIX_GAIN_RANGE, RELATIVE_STEP, validMatrix, validWhole } from './consts.js'

/** The values are the ids saved on buttons, so must never change */
export enum ActionIdMatrix {
	Mute = 'matrix_mute',
	Polarity = 'matrix_polarity',
	Gain = 'matrix_gain',
	GainRelative = 'matrix_gain_rel',
	Output = 'matrix_output',
	Crosspoint = 'matrix_crosspoint',
	CrosspointRelative = 'matrix_crosspoint_rel',
}

type MatrixOptions = { matrix: number }
/** channel is the matrix input, as it has always been called */
type CrosspointOptions = MatrixOptions & { channel: number }
type Query = { query: boolean }

export type ActionSchemaMatrix = {
	[ActionIdMatrix.Mute]: { options: MatrixOptions & Query & { mute: OffOnToggle } }
	[ActionIdMatrix.Polarity]: { options: MatrixOptions & Query & { polarity: OffOnToggle } }
	[ActionIdMatrix.Gain]: { options: MatrixOptions & Query & { gain: number } }
	[ActionIdMatrix.GainRelative]: { options: MatrixOptions & { gain: number } }
	[ActionIdMatrix.Output]: { options: MatrixOptions & Query & { output: number } }
	[ActionIdMatrix.Crosspoint]: { options: CrosspointOptions & Query & { gain: number } }
	[ActionIdMatrix.CrosspointRelative]: { options: CrosspointOptions & { gain: number } }
}

export function getMatrixActions(
	self: ModuleInstance,
	context: DefinitionContext,
): CompanionActionDefinitions<ActionSchemaMatrix> {
	const matrix = (n: number) => self.state.matrix(n)
	const inputOption = {
		id: 'channel',
		type: 'dropdown',
		label: 'Input Channel',
		// Automix channel 1. The choices are built at runtime, so there is no fixed entry to reference
		default: 1,
		choices: matrixInputChoices(context),
		expressionDescription: `Should return a matrix input number, 1 to ${MATRIX_INPUTS}`,
	} as const

	function subscribeTo(code: MatrixCode) {
		return {
			optionsToMonitorForSubscribe: ['matrix' as const],
			subscribe: ({ options }: { options: MatrixOptions }): void => {
				if (isMatrix(options.matrix)) self.request(matrixQuery(code, options.matrix))
			},
		}
	}

	const subscribeToCrosspoint = {
		optionsToMonitorForSubscribe: ['matrix' as const, 'channel' as const],
		subscribe: ({ options }: { options: CrosspointOptions }): void => {
			if (isMatrix(options.matrix) && isWhole(options.channel, 1, MATRIX_INPUTS)) {
				self.request(crosspointQuery(options.matrix, options.channel))
			}
		},
	}

	const validInput = (input: number) => validWhole(self, input, 1, MATRIX_INPUTS, 'matrix input')

	return {
		[ActionIdMatrix.Mute]: {
			name: 'Matrix - Bus Mute',
			description: 'Mute a Matrix Bus',
			options: [
				matrixOption,
				{
					id: 'mute',
					type: 'dropdown',
					label: 'Mute',
					default: MATRIX_MUTE_CHOICES[0].id,
					choices: MATRIX_MUTE_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				if (!validMatrix(self, m)) return
				if (options.query) return self.sendCommand(matrixQuery(Code.MatrixMute, m), signal)
				await self.sendCommand(
					() => matrixSet(Code.MatrixMute, m, resolveToggle(options.mute, matrix(m)?.mute ?? false)),
					signal,
				)
			},
			learn: ({ options }) => {
				const state = matrix(options.matrix)
				return state && { mute: state.mute ? 1 : 0 }
			},
			...subscribeTo(Code.MatrixMute),
		},
		[ActionIdMatrix.Polarity]: {
			name: 'Matrix - Bus Polarity',
			description: 'Change polarity of a Matrix Bus',
			options: [
				matrixOption,
				{
					id: 'polarity',
					type: 'dropdown',
					label: 'Polarity',
					default: POLARITY_CHOICES[0].id,
					choices: POLARITY_CHOICES,
				},
				queryOption,
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				if (!validMatrix(self, m)) return
				if (options.query) return self.sendCommand(matrixQuery(Code.MatrixPolarity, m), signal)
				await self.sendCommand(
					() => matrixSet(Code.MatrixPolarity, m, resolveToggle(options.polarity, matrix(m)?.polarity ?? false)),
					signal,
				)
			},
			learn: ({ options }) => {
				const state = matrix(options.matrix)
				return state && { polarity: state.polarity ? 1 : 0 }
			},
			...subscribeTo(Code.MatrixPolarity),
		},
		[ActionIdMatrix.Gain]: {
			name: 'Matrix - Gain',
			description: 'Set the gain of a Matrix Bus',
			options: [
				matrixOption,
				{
					id: 'gain',
					type: 'number',
					label: 'Gain',
					default: 0,
					min: MATRIX_GAIN_RANGE.min,
					max: MATRIX_GAIN_RANGE.max,
					range: true,
					step: 0.5,
				},
				queryOptionFor('current matrix output gain'),
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				if (!validMatrix(self, m)) return
				const command = options.query
					? matrixQuery(Code.MatrixGain, m)
					: matrixSet(Code.MatrixGain, m, clamp(options.gain, MATRIX_GAIN_RANGE.min, MATRIX_GAIN_RANGE.max))
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const state = matrix(options.matrix)
				return state && { gain: state.gain }
			},
			...subscribeTo(Code.MatrixGain),
		},
		[ActionIdMatrix.GainRelative]: {
			name: 'Matrix - Gain, Relative',
			description: 'Adjust the gain of a Matrix Bus',
			options: [
				matrixOption,
				{
					id: 'gain',
					type: 'number',
					label: 'Gain',
					default: 1,
					min: RELATIVE_STEP.min,
					max: RELATIVE_STEP.max,
					range: true,
					step: 0.5,
				},
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				if (!validMatrix(self, m)) return
				await self.sendCommand(() => {
					const gain = (matrix(m)?.gain ?? 0) + options.gain
					return matrixSet(Code.MatrixGain, m, clamp(gain, MATRIX_GAIN_RANGE.min, MATRIX_GAIN_RANGE.max))
				}, signal)
			},
			...subscribeTo(Code.MatrixGain),
		},
		[ActionIdMatrix.Output]: {
			name: 'Matrix - Output',
			description: 'Set the output channel of a Matrix Bus',
			options: [
				matrixOption,
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output',
					// No Output
					default: 0,
					choices: matrixOutputChoices(context),
					expressionDescription: `Should return an output number, 0 for none to ${MAX_MATRIX_OUTPUT}`,
				},
				queryOptionFor('matrix output channel'),
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				if (!validMatrix(self, m)) return
				if (options.query) return self.sendCommand(matrixQuery(Code.MatrixOutput, m), signal)
				if (!validWhole(self, options.output, 0, MAX_MATRIX_OUTPUT, 'matrix output')) return
				await self.sendCommand(matrixSet(Code.MatrixOutput, m, options.output), signal)
			},
			learn: ({ options }) => {
				const state = matrix(options.matrix)
				return state && { output: state.output }
			},
			...subscribeTo(Code.MatrixOutput),
		},
		[ActionIdMatrix.Crosspoint]: {
			name: 'Matrix - Crosspoint',
			description: 'Set the a crosspoint in the matrix',
			options: [
				matrixOption,
				inputOption,
				{
					id: 'gain',
					type: 'number',
					label: 'Crosspoint Gain',
					default: CROSSPOINT_RANGE.min,
					min: CROSSPOINT_RANGE.min,
					max: CROSSPOINT_RANGE.max,
					range: true,
					step: 0.5,
				},
				queryOptionFor('matrix crosspoint gain'),
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				if (!validMatrix(self, m) || !validInput(options.channel)) return
				const command = options.query
					? crosspointQuery(m, options.channel)
					: crosspointSet(m, options.channel, clamp(options.gain, CROSSPOINT_RANGE.min, CROSSPOINT_RANGE.max))
				await self.sendCommand(command, signal)
			},
			learn: ({ options }) => {
				const gain = matrix(options.matrix)?.crosspoints[options.channel - 1]
				return gain === undefined ? undefined : { gain }
			},
			...subscribeToCrosspoint,
		},
		[ActionIdMatrix.CrosspointRelative]: {
			name: 'Matrix - Crosspoint, Relative',
			description: 'Adjust a crosspoint in the matrix',
			options: [
				matrixOption,
				inputOption,
				{
					id: 'gain',
					type: 'number',
					label: 'Crosspoint Gain',
					default: 1,
					min: RELATIVE_STEP.min,
					max: RELATIVE_STEP.max,
					range: true,
					step: 0.5,
				},
			],
			callback: async ({ options }, { signal }) => {
				const m = options.matrix
				const input = options.channel
				if (!validMatrix(self, m) || !validInput(input)) return
				await self.sendCommand(() => {
					const current = matrix(m)?.crosspoints[input - 1]
					if (current === undefined) return undefined
					const gain = clamp(current + options.gain, CROSSPOINT_RANGE.min, CROSSPOINT_RANGE.max)
					return crosspointSet(m, input, gain)
				}, signal)
			},
			...subscribeToCrosspoint,
		},
	}
}
