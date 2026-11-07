import type { DropdownChoice } from '@companion-module/base'
import { isGroup, isMatrix, isWhole, type GroupNumber, type MatrixNumber } from '../api/index.js'
import type ModuleInstance from '../main.js'

/**
 * Whether an action's channel is one of the unit's automix channels. Logs why not, as an action that does nothing
 * should say so.
 */
export function validChannel(self: ModuleInstance, channel: number): boolean {
	if (isWhole(channel, 1, self.channelCount)) return true
	self.log('warn', `Channel ${channel} is not one of the ${self.channelCount} automix channels`)
	return false
}

export function validGroup(self: ModuleInstance, group: number): group is GroupNumber {
	if (isGroup(group)) return true
	self.log('warn', `${group} is not a group number, 1 to 3`)
	return false
}

export function validMatrix(self: ModuleInstance, matrix: number): matrix is MatrixNumber {
	if (isMatrix(matrix)) return true
	self.log('warn', `${matrix} is not a matrix number, 1 to 6`)
	return false
}

/** Whether a value is a whole number in range, logging why not */
export function validWhole(self: ModuleInstance, value: number, min: number, max: number, what: string): boolean {
	if (isWhole(value, min, max)) return true
	self.log('warn', `${value} is not a valid ${what}, ${min} to ${max}`)
	return false
}

/** Whether a value saved on a button is still one of the choices, logging if not */
export function isChoice<T extends string | number>(
	self: ModuleInstance,
	choices: readonly DropdownChoice<T>[],
	value: unknown,
): value is T {
	if (choices.some((choice) => choice.id === value)) return true
	self.log('warn', `${String(value)} is not one of the choices`)
	return false
}

/** The ranges the unit takes, in dB, which values are clamped to */
export const WEIGHT_RANGE = { min: -100, max: 15 } as const
export const AUTOMIX_DEPTH_RANGE = { min: -100, max: 0 } as const
export const NOM_GAIN_LIMIT_RANGE = { min: 1, max: 10 } as const
export const MUSIC_THRESHOLD_RANGE = { min: -100, max: 15 } as const
export const MATRIX_GAIN_RANGE = { min: -25, max: 15 } as const
export const CROSSPOINT_RANGE = { min: -96, max: 0 } as const
/** The step a relative action takes, either way */
export const RELATIVE_STEP = { min: -6, max: 6 } as const
