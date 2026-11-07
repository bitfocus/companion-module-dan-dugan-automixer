import { Code, MODEL_M, MODEL_N, MODEL_NAMES, PARAM_SEP, command, sceneNames, type Reply } from './api/index.js'
import { RecordReply } from './actionRecorder.js'
import { feedbacksFor } from './feedbacks.js'
import type ModuleInstance from './main.js'
import type { Change } from './state.js'
import { changedValues, talkingValues } from './variables.js'

/** Clients the unit takes at once, over UDP and TCP together */
const MAX_CLIENTS = 5

const modelName = (model: number) => MODEL_NAMES[model] ?? `model ${model}`

/** Updates the variables and feedbacks some changes affect */
export function PublishChanges(self: ModuleInstance, changes: readonly Change[]): void {
	if (changes.length === 0) return
	const values = changedValues(self.state, changes, self.model)
	const talkerMoved = changes.some(
		(change) => change.kind === 'channel' && (change.field === 'automixGain' || change.field === 'name'),
	)
	if (talkerMoved) Object.assign(values, talkingValues(self.state, self.channelCount, self.config.isTalkingThreshold))
	if (Object.keys(values).length > 0) self.setVariableValues(values)
	const [first, ...rest] = feedbacksFor(changes)
	if (first !== undefined) self.checkFeedbacks(first, ...rest)
}

/**
 * Takes in a reply from the unit: the state, variables and feedbacks follow, the action recorder hears of any change,
 * and anything the reply calls for is asked for
 */
export function HandleReply(self: ModuleInstance, reply: Reply): void {
	const before = { channelCount: self.channelCount, model: self.model }
	const changes = self.state.apply(reply)
	PublishChanges(self, changes)
	if (self.isRecordingActions) RecordReply(self, reply, changes)

	if (self.model !== before.model) {
		self.log('warn', `Configured as a ${modelName(self.config.model)}, but connected to a ${modelName(self.model)}`)
	}
	if (self.channelCount !== before.channelCount) {
		self.log('warn', `The unit has ${self.channelCount} automix channels, not ${before.channelCount}`)
	}
	if (self.model !== before.model || self.channelCount !== before.channelCount) self.updateDefinitions()

	switch (reply.type) {
		case 'sceneCount':
			if (reply.count > 0) {
				self.sendBackground(sceneNames(1, reply.count))
			} else {
				// Nothing to list, and no list will come to say so
				HandleReply(self, { type: 'sceneList', names: [] })
			}
			break
		case 'sceneList':
			// The scene dropdowns list them
			if (changes.length > 0) self.updateActions()
			break
		case 'scene':
			handleSceneEvent(self, reply)
			break
		case 'info':
			if (reply.info.clientUDP !== undefined && reply.info.clientTCP !== undefined) {
				if (reply.info.clientUDP + reply.info.clientTCP >= MAX_CLIENTS) {
					self.log('warn', 'All connections full, cannot accept more concurrent clients')
				}
			}
			break
		case 'subscribe':
			self.log('info', `Unsolicited message level: ${reply.level}`)
			break
		case 'error':
			self.log('warn', `Bad response: ${reply.code}${PARAM_SEP}${reply.message}`)
			break
		case 'notice':
			self.log('info', reply.message)
			break
		case 'unexpected':
			self.log('warn', `Unexpected response from unit: ${reply.reason}`)
			break
		default:
			break
	}
}

function handleSceneEvent(self: ModuleInstance, reply: Extract<Reply, { type: 'scene' }>): void {
	const [name, next] = reply.names
	switch (reply.event) {
		case 'recalled':
			self.log('info', `Scene recalled: ${name}`)
			self.sendBackground(command(Code.SceneActive))
			break
		case 'saved':
		case 'savedNew':
			self.log('info', `Scene saved: ${name}`)
			self.sendBackground(command(Code.SceneCount))
			self.sendBackground(command(Code.SceneActive))
			break
		case 'deleted':
			self.log('info', `Scene deleted: ${name}`)
			self.sendBackground(command(Code.SceneCount))
			self.sendBackground(command(Code.SceneActive))
			break
		case 'renamed':
			self.log('info', `Scene ${name} renamed to ${next}`)
			self.sendBackground(command(Code.SceneCount))
			self.sendBackground(command(Code.SceneActive))
			break
		case 'channelDefaults':
			self.log('info', 'Channels reset to defaults')
			self.sendBackground(command(Code.SceneActive))
			break
		case 'matrixDefaults':
			self.log('info', 'Matrix reset to defaults')
			// The crosspoints have all changed
			if (self.model === MODEL_M || self.model === MODEL_N) self.sendBackground(command(Code.MatrixBulk))
			break
	}
}
