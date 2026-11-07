import { describe, expect, it } from 'vitest'
import type {
	CompanionMigrationAction,
	CompanionStaticUpgradeProps,
	CompanionUpgradeContext,
} from '@companion-module/base'
import { UpgradeScripts, numericActionOptionsApi2, sceneNameOptionsApi2, variableFieldsApi2 } from '../upgrades.js'
import { UpdateActions } from '../actions.js'
import type { ModuleConfig } from '../config.js'
import { actionDefinitions, config, fakeInstance } from './fixtures.js'

/**
 * Upgrade scripts are order-sensitive: a stored upgrade index records how far a configuration has been migrated, so
 * scripts may only ever be appended. Pin the index rather than taking the last entry.
 */
const API2_SCRIPT_INDEX = 0
const EXPECTED_SCRIPT_COUNT = 1

// Options reach upgrade scripts already wrapped as ExpressionOrValue. Companion does that before running them
const v = (value: unknown) => ({ isExpression: false, value })
const expr = (value: string) => ({ isExpression: true, value })

function action(actionId: string, options: Record<string, unknown>): CompanionMigrationAction {
	return {
		id: `action-${actionId}`,
		controlId: 'bank-1',
		actionId,
		options: options as CompanionMigrationAction['options'],
	}
}

function run(actions: CompanionMigrationAction[], cfg: unknown = null) {
	return UpgradeScripts[API2_SCRIPT_INDEX]({} as CompanionUpgradeContext<ModuleConfig>, {
		config: cfg as ModuleConfig | null,
		secrets: null,
		actions,
		feedbacks: [],
	} satisfies CompanionStaticUpgradeProps<ModuleConfig, undefined>)
}

describe('API 2 upgrade script', () => {
	it('sits at the index this suite targets', () => {
		// Appending a script is fine: bump EXPECTED_SCRIPT_COUNT. Never insert, reorder or remove one
		expect(UpgradeScripts).toHaveLength(EXPECTED_SCRIPT_COUNT)
	})

	it('converts custom channel, group and matrix values to numbers', () => {
		const mode = action('channel_mode', { channel: v('3'), mode: v(1), query: v(false) })
		const depth = action('group_automixdepth_rel', { group: v('2'), depth: v(1) })
		const output = action('matrix_output', { matrix: v('1'), output: v('65'), query: v(false) })
		const result = run([mode, depth, output])
		expect(result.updatedActions).toEqual([mode, depth, output])
		expect(mode.options.channel).toEqual(v(3))
		expect(depth.options.group).toEqual(v(2))
		expect(output.options.output).toEqual(v(65))
	})

	it('turns a variable in a dropdown into an expression', () => {
		const bypass = action('channel_bypass', { channel: v('$(internal:ch)'), bypass: v(10), query: v(false) })
		const crosspoint = action('matrix_crosspoint_rel', { matrix: v(1), channel: v('$(internal:x)'), gain: v(1) })
		run([bypass, crosspoint])
		expect(bypass.options.channel).toEqual(expr('$(internal:ch)'))
		expect(crosspoint.options.channel).toEqual(expr('$(internal:x)'))
	})

	it('puts a ticked Use Variable into the number field as an expression, and drops the two old fields', () => {
		const weight = action('channel_weight', {
			channel: v(2),
			useVar: v(true),
			weight: v(0),
			weightVar: v('$(internal:w)'),
			query: v(false),
		})
		const gain = action('matrix_crosspoint', {
			matrix: v(1),
			channel: v(1),
			useVar: v(true),
			gain: v(-96),
			gainVar: v('-$(internal:g)'),
			query: v(false),
		})
		run([weight, gain])
		expect(weight.options).toEqual({ channel: v(2), weight: expr('$(internal:w)'), query: v(false) })
		expect(gain.options.gain).toEqual(expr('parseVariables("-$(internal:g)")'))
		expect(gain.options).not.toHaveProperty('useVar')
		expect(gain.options).not.toHaveProperty('gainVar')
	})

	it('keeps the number when Use Variable was not ticked, or the variable field was empty', () => {
		const unticked = action('group_NOMgainlimit', {
			group: v(1),
			useVar: v(false),
			nomgain: v(3),
			nomVar: v('$(internal:n)'),
			query: v(false),
		})
		const empty = action('matrix_gain', { matrix: v(1), useVar: v(true), gain: v(-4), gainVar: v(''), query: v(false) })
		const result = run([unticked, empty])
		expect(result.updatedActions).toEqual([unticked, empty])
		expect(unticked.options).toEqual({ group: v(1), nomgain: v(3), query: v(false) })
		expect(empty.options).toEqual({ matrix: v(1), gain: v(-4), query: v(false) })
	})

	it('turns a scene name holding a variable into an expression, and leaves other names alone', () => {
		const variable = action('sc_recall', { name: v('$(internal:scene)') })
		const mixed = action('sc_delete', { name: v('Day $(internal:n)') })
		const plain = action('sc_save', { name: v('Sunday') })
		const numeric = action('sc_rename', { currentname: v('3'), newname: v('$(internal:new)') })
		const result = run([variable, mixed, plain, numeric])
		expect(result.updatedActions).toEqual([variable, mixed])
		expect(variable.options.name).toEqual(expr('$(internal:scene)'))
		expect(mixed.options.name).toEqual(expr('parseVariables("Day $(internal:n)")'))
		expect(plain.options.name).toEqual(v('Sunday'))
		// A textinput, which still takes variables
		expect(numeric.options).toEqual({ currentname: v('3'), newname: v('$(internal:new)') })
	})

	it('does not report actions it had nothing to convert', () => {
		const alreadyNumber = action('channel_mode', { channel: v(4), mode: v(1), query: v(false) })
		const alreadyExpression = action('matrix_mute', { matrix: expr('1 + 1'), mute: v(0), query: v(false) })
		const unrelated = action('sc_count', {})
		expect(run([alreadyNumber, alreadyExpression, unrelated]).updatedActions).toEqual([])
		expect(alreadyExpression.options.matrix).toEqual(expr('1 + 1'))
	})

	it('drops the UDP option and makes the port a number', () => {
		const old = { ...config(), port: '9776', udp: false }
		const result = run([], old)
		expect(result.updatedConfig).toEqual(config({ port: 9776 }))
		expect(result.updatedConfig).not.toHaveProperty('udp')
	})

	it('falls back to port 23 for a port that is not one', () => {
		expect(run([], { ...config(), port: 'telnet' }).updatedConfig?.port).toBe(23)
	})

	it('leaves a config that needs nothing', () => {
		expect(run([], config()).updatedConfig).toBeNull()
		expect(run([], null).updatedConfig).toBeNull()
	})
})

type OptionLike = { id: string; type: string; choices?: { id: unknown }[]; allowCustom?: boolean }
type DefinitionLike = { options: OptionLike[] } | undefined

describe('upgrade maps match the current definitions', () => {
	const fake = fakeInstance()
	UpdateActions(fake.self)
	const defs = actionDefinitions(fake) as unknown as Record<string, DefinitionLike>
	const option = (actionId: string, id: string) => defs[actionId]?.options.find((o) => o.id === id)

	// The script stores numbers, so each converted option must still hold one: a number field, or a dropdown whose
	// choice ids are all numbers
	it.each(Object.entries(numericActionOptionsApi2))('action %s: converted options hold numbers', (actionId, keys) => {
		for (const key of keys) {
			const field = option(actionId, key)
			const numeric =
				field?.type === 'number' ||
				(field?.type === 'dropdown' && field.choices?.every((choice) => typeof choice.id === 'number'))
			expect(numeric, `${actionId}.${key}`).toBe(true)
		}
	})

	it.each(Object.entries(variableFieldsApi2))(
		'action %s: the number field is one, and the old fields are gone',
		(id, f) => {
			expect(option(id, f.number)?.type).toBe('number')
			expect(option(id, f.flag)).toBeUndefined()
			expect(option(id, f.variable)).toBeUndefined()
		},
	)

	it.each(Object.entries(sceneNameOptionsApi2))('action %s: the scene names still take custom values', (id, keys) => {
		for (const key of keys) expect(option(id, key)).toMatchObject({ type: 'dropdown', allowCustom: true })
	})
})
