import type ModuleInstance from './main.js'
import { getChannelActions, type ActionSchemaChannel } from './actions/channel.js'
import { getGroupActions, type ActionSchemaGroup } from './actions/group.js'
import { getMatrixActions, type ActionSchemaMatrix } from './actions/matrix.js'
import { getSceneActions, type ActionSchemaScene } from './actions/scene.js'
import { getSystemActions, type ActionSchemaSystem } from './actions/system.js'

export { ActionIdChannel } from './actions/channel.js'
export { ActionIdGroup } from './actions/group.js'
export { ActionIdMatrix } from './actions/matrix.js'
export { ActionIdScene } from './actions/scene.js'
export { ActionIdSystem } from './actions/system.js'

export type ActionSchema = ActionSchemaChannel &
	ActionSchemaGroup &
	ActionSchemaMatrix &
	ActionSchemaScene &
	ActionSchemaSystem

export function UpdateActions(self: ModuleInstance): void {
	const context = self.definitionContext
	self.setActionDefinitions({
		...getChannelActions(self, context),
		...getGroupActions(self, context),
		...getMatrixActions(self, context),
		...getSceneActions(self),
		...getSystemActions(self, context),
	})
}
