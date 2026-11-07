import {
	FixupNumericOrVariablesValueToExpressions,
	type CompanionMigrationAction,
	type CompanionStaticUpgradeProps,
	type CompanionStaticUpgradeResult,
	type CompanionStaticUpgradeScript,
	type CompanionUpgradeContext,
	type ExpressionOrValue,
	type JsonValue,
} from '@companion-module/base'
import { isWhole } from './api/index.js'
import { DEFAULT_PORT, type ModuleConfig } from './config.js'

type StoredOption = ExpressionOrValue<JsonValue | undefined> | undefined

/*
 * Frozen history for UpgradeScripts[0]: the action ids and option keys as they stood in 1.x. Do not edit these to
 * track later changes; add a new script instead. Strings rather than the ActionId enums, so a later rename of an enum
 * member can't change what this script did.
 */

/**
 * Dropdowns that took custom values and variables, holding numbers. They are numeric dropdowns since, with expression
 * mode in place of the custom values.
 */
export const numericActionOptionsApi2: Readonly<Record<string, readonly string[]>> = {
	channel_mode: ['channel'],
	channel_preset: ['channel'],
	channel_bypass: ['channel'],
	channel_override: ['channel'],
	channel_weight: ['channel'],
	channel_weight_rel: ['channel'],
	channel_music_mode: ['channel'],
	channel_NOM_mode: ['channel'],
	channel_group_assign: ['channel'],
	channel_name: ['channel'],
	group_automixdepth: ['group'],
	group_automixdepth_rel: ['group'],
	group_NOMgainlimit: ['group'],
	group_NOMgainlimit_rel: ['group'],
	group_musicthreshold: ['group'],
	group_musicthreshold_rel: ['group'],
	group_musicinput: ['group', 'input'],
	matrix_mute: ['matrix'],
	matrix_polarity: ['matrix'],
	matrix_gain: ['matrix'],
	matrix_gain_rel: ['matrix'],
	matrix_output: ['matrix', 'output'],
	matrix_crosspoint: ['matrix', 'channel'],
	matrix_crosspoint_rel: ['matrix', 'channel'],
}

/** A number field with a Use Variable checkbox, and a text field for the variable shown in its place when ticked */
export interface VariableFieldApi2 {
	readonly flag: string
	readonly variable: string
	readonly number: string
}

/** The number field takes the variable as an expression, and the checkbox and text field go */
export const variableFieldsApi2: Readonly<Record<string, VariableFieldApi2>> = {
	channel_weight: { flag: 'useVar', variable: 'weightVar', number: 'weight' },
	group_automixdepth: { flag: 'useVar', variable: 'depthVar', number: 'depth' },
	group_NOMgainlimit: { flag: 'useVar', variable: 'nomVar', number: 'nomgain' },
	group_musicthreshold: { flag: 'useVar', variable: 'thresholdVar', number: 'threshold' },
	matrix_gain: { flag: 'useVar', variable: 'gainVar', number: 'gain' },
	matrix_crosspoint: { flag: 'useVar', variable: 'gainVar', number: 'gain' },
}

/**
 * Scene name dropdowns that took variables as well as custom values. They still take custom values, but a dropdown
 * no longer parses variables, so a name holding one becomes an expression.
 */
export const sceneNameOptionsApi2: Readonly<Record<string, readonly string[]>> = {
	sc_recall: ['name'],
	sc_save: ['name'],
	sc_rename: ['currentname'],
	sc_delete: ['name'],
}

/** Whether the helper changed a value. It always hands back a fresh object, so compare contents, not identity */
function differs(a: StoredOption, b: StoredOption): boolean {
	return a?.isExpression !== b?.isExpression || a?.value !== b?.value
}

function fixupNumeric(action: CompanionMigrationAction, keys: readonly string[] | undefined): boolean {
	let changed = false
	for (const key of keys ?? []) {
		const current = action.options[key]
		const fixed = FixupNumericOrVariablesValueToExpressions(current)
		if (differs(current, fixed)) {
			action.options[key] = fixed
			changed = true
		}
	}
	return changed
}

function mergeVariableField(action: CompanionMigrationAction, field: VariableFieldApi2 | undefined): boolean {
	if (field === undefined) return false
	const { options } = action
	if (!(field.flag in options) && !(field.variable in options)) return false
	const variable = options[field.variable]
	const used = options[field.flag]?.value === true
	// An empty variable field sent the number field's value in 1.x, so leave that standing
	if (used && typeof variable?.value === 'string' && variable.value.trim() !== '') {
		options[field.number] = FixupNumericOrVariablesValueToExpressions(variable)
	}
	delete options[field.flag]
	delete options[field.variable]
	return true
}

function fixupSceneNames(action: CompanionMigrationAction, keys: readonly string[] | undefined): boolean {
	let changed = false
	for (const key of keys ?? []) {
		const current = action.options[key]
		// Only a name with a variable in it: the helper would make "3" a number, and wrap any other text needlessly
		if (current === undefined || current.isExpression || typeof current.value !== 'string') continue
		if (!current.value.includes('$(')) continue
		action.options[key] = FixupNumericOrVariablesValueToExpressions(current)
		changed = true
	}
	return changed
}

/** The config as 1.x might have saved it */
type LegacyConfig = Omit<ModuleConfig, 'port'> & { port: unknown; udp?: unknown }

/** Drops the UDP option, which was never implemented, and makes the port a number, as its field now is */
function upgradeConfig(config: ModuleConfig | null): ModuleConfig | null {
	if (config === null) return null
	const legacy = config as LegacyConfig
	let changed = false
	if ('udp' in legacy) {
		delete legacy.udp
		changed = true
	}
	if (typeof legacy.port !== 'number') {
		const port = Number(legacy.port)
		legacy.port = isWhole(port, 1, 65535) ? port : DEFAULT_PORT
		changed = true
	}
	return changed ? (legacy as ModuleConfig) : null
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */

	// 0: API 2.x. "3" becomes 3, "$(local:ch)" an expression, and anything else is wrapped in parseVariables()
	function (
		_context: CompanionUpgradeContext<ModuleConfig>,
		props: CompanionStaticUpgradeProps<ModuleConfig, undefined>,
	): CompanionStaticUpgradeResult<ModuleConfig, undefined> {
		return {
			updatedConfig: upgradeConfig(props.config),
			updatedActions: props.actions.filter((action) => {
				const id = action.actionId
				// Each step runs whatever the one before found, so no conversion is skipped
				const merged = mergeVariableField(action, variableFieldsApi2[id])
				const numeric = fixupNumeric(action, numericActionOptionsApi2[id])
				const scenes = fixupSceneNames(action, sceneNameOptionsApi2[id])
				return merged || numeric || scenes
			}),
			updatedFeedbacks: [],
		}
	},
]
