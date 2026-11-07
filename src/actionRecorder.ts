import type { CompanionOptionValues } from '@companion-module/base'
import { Code, type Reply } from './api/index.js'
import { ActionIdChannel, ActionIdGroup, ActionIdMatrix, ActionIdScene } from './actions.js'
import { groupFlagOptions } from './actions/group.js'
import type ModuleInstance from './main.js'
import type { Change, ChannelState, MatrixState } from './state.js'
import { unhandledOption } from './util.js'

const CHANNEL_ACTIONS = {
	mode: ActionIdChannel.Mode,
	preset: ActionIdChannel.Preset,
	bypass: ActionIdChannel.Bypass,
	override: ActionIdChannel.Override,
	weight: ActionIdChannel.Weight,
	music: ActionIdChannel.Music,
	nom: ActionIdChannel.Nom,
	group: ActionIdChannel.GroupAssign,
} as const

/** The option each channel setting is held in by its action */
const CHANNEL_OPTIONS = {
	mode: 'mode',
	preset: 'preset',
	bypass: 'bypass',
	override: 'override',
	weight: 'weight',
	music: 'music',
	nom: 'nom',
	group: 'group',
} as const

const GROUP_FLAG_ACTIONS = {
	mute: ActionIdGroup.Mute,
	preset: ActionIdGroup.Preset,
	override: ActionIdGroup.Override,
	lastHold: ActionIdGroup.LastHold,
} as const

const GROUP_ACTIONS = {
	automixDepth: [ActionIdGroup.AutomixDepth, 'depth'],
	nomGainLimit: [ActionIdGroup.NomGainLimit, 'nomgain'],
	musicThreshold: [ActionIdGroup.MusicThreshold, 'threshold'],
	musicInput: [ActionIdGroup.MusicInput, 'input'],
} as const

const MATRIX_ACTIONS = {
	mute: ActionIdMatrix.Mute,
	polarity: ActionIdMatrix.Polarity,
	gain: ActionIdMatrix.Gain,
	output: ActionIdMatrix.Output,
} as const

/** A setting as its action's option holds it: on/off dropdowns hold 0 and 1 */
function optionValue(value: ChannelState[keyof ChannelState] | MatrixState['gain'] | boolean): number | string {
	return typeof value === 'boolean' ? (value ? 1 : 0) : value
}

/**
 * Records the action that would make the change a reply reports, while Companion's action recorder is running. Only
 * changes are recorded, from this module or anywhere else, so the queries on connecting and the polls add nothing.
 * Each setting has one entry, replaced by a later change to it.
 */
export function RecordReply(self: ModuleInstance, reply: Reply, changes: readonly Change[]): void {
	const record = (actionId: string, options: CompanionOptionValues, uniqueness: string) =>
		self.recordAction({ actionId, options }, uniqueness)
	switch (reply.type) {
		case 'channel': {
			if (changes.length === 0) return
			const state = self.state.channel(reply.channel)
			if (state === undefined) return
			const actionId = CHANNEL_ACTIONS[reply.field]
			const options = {
				channel: reply.channel,
				[CHANNEL_OPTIONS[reply.field]]: optionValue(state[reply.field]),
				query: false,
			}
			record(actionId, options, `${actionId} ${reply.channel}`)
			break
		}
		case 'channelName':
			if (changes.length === 0) return
			record(
				ActionIdChannel.Name,
				{ channel: reply.channel, name: reply.name, query: false },
				`${ActionIdChannel.Name} ${reply.channel}`,
			)
			break
		case 'groupFlags': {
			if (changes.length === 0) return
			const actionId = GROUP_FLAG_ACTIONS[reply.flag]
			record(actionId, { ...groupFlagOptions(reply.flag, (g) => self.state.group(g)), query: false }, actionId)
			break
		}
		case 'group': {
			if (changes.length === 0) return
			const [actionId, option] = GROUP_ACTIONS[reply.field]
			record(actionId, { group: reply.group, [option]: reply.value, query: false }, `${actionId} ${reply.group}`)
			break
		}
		case 'matrix': {
			if (changes.length === 0) return
			const state = self.state.matrix(reply.matrix)
			if (state === undefined) return
			const actionId = MATRIX_ACTIONS[reply.field]
			const options = { matrix: reply.matrix, [reply.field]: optionValue(state[reply.field]), query: false }
			record(actionId, options, `${actionId} ${reply.matrix}`)
			break
		}
		case 'crosspoint':
			if (changes.length === 0) return
			record(
				ActionIdMatrix.Crosspoint,
				{ matrix: reply.matrix, channel: reply.input, gain: reply.gain, query: false },
				`${ActionIdMatrix.Crosspoint} ${reply.matrix} ${reply.input}`,
			)
			break
		case 'scene':
			// Events rather than settings, so recorded whether or not anything changed
			if (reply.event === 'recalled') {
				record(ActionIdScene.Recall, { name: reply.names[0] }, ActionIdScene.Recall)
			} else if (reply.event === 'channelDefaults' || reply.event === 'matrixDefaults') {
				const mode = reply.event === 'channelDefaults' ? Code.ChannelDefaults : Code.MatrixDefaults
				record(ActionIdScene.RecallDefaults, { mode }, ActionIdScene.RecallDefaults)
			}
			break
		case 'channelNames':
		case 'channelMeters':
		case 'groupMeters':
		case 'matrixMeters':
		case 'channelFlags':
		case 'meterStatus':
		case 'channelBulk':
		case 'matrixBulk':
		case 'sceneCount':
		case 'sceneActive':
		case 'sceneList':
		case 'subscribe':
		case 'info':
		case 'error':
		case 'notice':
		case 'unexpected':
			break
		default:
			unhandledOption(reply, undefined)
	}
}
