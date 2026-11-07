import type { CompanionActionDefinitions, CompanionInputFieldDropdown, DropdownChoice } from '@companion-module/base'
import { Code, command, sceneNamed, sceneRename, type Command } from '../api/index.js'
import type ModuleInstance from '../main.js'
import { isChoice } from './consts.js'

/** The values are the ids saved on buttons, so must never change */
export enum ActionIdScene {
	Count = 'sc_count',
	Active = 'sc_active',
	Recall = 'sc_recall',
	Save = 'sc_save',
	SaveNew = 'sc_newsave',
	Rename = 'sc_rename',
	Delete = 'sc_delete',
	RecallDefaults = 'recall_default',
}

export type DefaultsCode = Code.ChannelDefaults | Code.MatrixDefaults

export type ActionSchemaScene = {
	[ActionIdScene.Count]: { options: Record<string, never> }
	[ActionIdScene.Active]: { options: Record<string, never> }
	[ActionIdScene.Recall]: { options: { name: string } }
	[ActionIdScene.Save]: { options: { name: string } }
	[ActionIdScene.SaveNew]: { options: Record<string, never> }
	[ActionIdScene.Rename]: { options: { currentname: string; newname: string } }
	[ActionIdScene.Delete]: { options: { name: string } }
	[ActionIdScene.RecallDefaults]: { options: { mode: DefaultsCode } }
}

const DEFAULTS_CHOICES = [
	{ id: Code.ChannelDefaults, label: 'Channel Defaults' },
	{ id: Code.MatrixDefaults, label: 'Matrix Defaults' },
] as const satisfies DropdownChoice<DefaultsCode>[]

const NAME_TOOLTIP = 'Max Length: 16 characters, up to the first of , * ; or :'

export function getSceneActions(self: ModuleInstance): CompanionActionDefinitions<ActionSchemaScene> {
	const scenes: DropdownChoice<string>[] = self.state.scenes.names.map((name) => ({ id: name, label: name }))

	/**
	 * Took variables before API 2.0, which UpgradeScripts[0] turns into expressions. Custom values are still taken, for a
	 * scene not yet saved or not yet listed.
	 */
	function sceneOption<K extends string>(
		id: K,
		label: string,
		initial: string,
	): CompanionInputFieldDropdown<K, string> {
		return { id, type: 'dropdown', label, choices: scenes, default: initial, allowCustom: true, tooltip: NAME_TOOLTIP }
	}

	/** Builds a command from names typed in, logging rather than throwing if one isn't usable */
	async function sendNamed(build: () => Command, signal: AbortSignal): Promise<void> {
		let named: Command
		try {
			named = build()
		} catch (err) {
			self.log('warn', `Not a valid scene name: ${err instanceof Error ? err.message : String(err)}`)
			return
		}
		await self.sendCommand(named, signal)
	}

	return {
		[ActionIdScene.Count]: {
			name: 'Scene - Count',
			description: 'Query number of saved scenes',
			options: [{ id: 'info', type: 'static-text', label: '', value: 'Returns number of scenes saved in unit' }],
			callback: async (_action, { signal }) => self.sendCommand(command(Code.SceneCount), signal),
		},
		[ActionIdScene.Active]: {
			name: 'Scene - Active',
			description: 'Query the active scene',
			options: [{ id: 'info', type: 'static-text', label: '', value: 'Returns name of active scene' }],
			callback: async (_action, { signal }) => self.sendCommand(command(Code.SceneActive), signal),
		},
		[ActionIdScene.Recall]: {
			name: 'Scene - Recall',
			description: 'Recall a saved scene',
			options: [sceneOption('name', 'Scene Name', 'Factory Defaults')],
			callback: async ({ options }, { signal }) => sendNamed(() => sceneNamed(Code.SceneRecall, options.name), signal),
		},
		[ActionIdScene.Save]: {
			name: 'Scene - Save',
			description: 'Save a scene',
			options: [sceneOption('name', 'Scene Name', 'New Scene')],
			callback: async ({ options }, { signal }) => sendNamed(() => sceneNamed(Code.SceneSave, options.name), signal),
		},
		[ActionIdScene.SaveNew]: {
			name: 'Scene - Save New',
			description: 'Save a new scene',
			options: [
				{ id: 'name', type: 'static-text', label: 'Scene Name', value: 'A default scene name will be written' },
			],
			callback: async (_action, { signal }) => self.sendCommand(command(Code.SceneSaveNew), signal),
		},
		[ActionIdScene.Rename]: {
			name: 'Scene - Rename',
			description: 'Rename an existing scene',
			options: [
				sceneOption('currentname', 'Current Name', ''),
				{
					id: 'newname',
					type: 'textinput',
					label: 'New Name',
					default: 'New Scene Name',
					useVariables: true,
					tooltip: NAME_TOOLTIP,
				},
			],
			callback: async ({ options }, { signal }) =>
				sendNamed(() => sceneRename(options.currentname, options.newname), signal),
		},
		[ActionIdScene.Delete]: {
			name: 'Scene - Delete',
			description: 'Delete an existing scene',
			options: [sceneOption('name', 'Scene Name', '')],
			callback: async ({ options }, { signal }) => sendNamed(() => sceneNamed(Code.SceneDelete, options.name), signal),
		},
		[ActionIdScene.RecallDefaults]: {
			name: 'Recall Defaults',
			description: 'Recall default channel or matrix settings',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Channel or Matrix',
					default: DEFAULTS_CHOICES[0].id,
					choices: DEFAULTS_CHOICES,
				},
			],
			callback: async ({ options }, { signal }) => {
				if (isChoice(self, DEFAULTS_CHOICES, options.mode)) await self.sendCommand(command(options.mode), signal)
			},
		},
	}
}
