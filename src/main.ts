import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import {
	Code,
	DuganConnection,
	GROUPS,
	MODEL_M,
	MODEL_N,
	MODELS_WITHOUT_METERS,
	Priority,
	channelNames,
	channelQuery,
	command,
	groupQuery,
	isWhole,
	type Command,
	type CommandSource,
	type ConnectionTiming,
} from './api/index.js'
import { UpdateActions, type ActionSchema } from './actions.js'
import { GetConfigFields, configuredChannels, messageGap, type ModuleConfig } from './config.js'
import { UpdateFeedbacks, type FeedbackSchema } from './feedbacks.js'
import { HandleReply } from './handleReply.js'
import type { DefinitionContext } from './options.js'
import { DeviceState } from './state.js'
import { UpgradeScripts } from './upgrades.js'
import { errorMessage } from './util.js'
import { UpdateVariableDefinitions, allValues, talkingValues, type VariablesSchema } from './variables.js'

export type ModuleTypes = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionSchema
	feedbacks: FeedbackSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

/** The unit's software asks for names 16 at a time */
const NAMES_PER_QUERY = 16

/** Asked for on connecting, before the subscription level, names, weights and group settings */
const QUERIES_ON_CONNECT = [
	Code.SystemConfig,
	Code.Firmware,
	Code.BlinkMode,
	Code.Resources,
	Code.SwitchHeadroom,
	Code.SceneCount,
	Code.SceneActive,
	Code.LinkGroup,
	Code.ClockSource,
	Code.AdatMirror,
	Code.Connections,
	Code.SampleRate,
	Code.Master,
	Code.ChannelOffset,
	Code.AutomixChannels,
] as const

export default class DuganInstance extends InstanceBase<ModuleTypes> {
	config!: ModuleConfig // Setup in init()
	/** What the unit has reported. Replaced when the connection is, as it may be another unit */
	state = new DeviceState()
	isRecordingActions = false
	/** Tests shorten the connection's timing */
	connectionTiming: Partial<ConnectionTiming> = {}
	#connection: DuganConnection | undefined
	/** Commands asked for in the background on the current connection, so each goes once however many ask */
	readonly #requested = new Set<string>()
	#pollTimer: NodeJS.Timeout | undefined
	#meterTimer: NodeJS.Timeout | undefined
	#pollPending = false
	#meterPending = false

	/** The unit's model, as it reports it, or as configured until it has */
	get model(): number {
		return this.state.info.model ?? this.config.model
	}

	/** The unit's automix channel count, as it reports it, or as configured until it has */
	get channelCount(): number {
		return this.state.info.channelCount ?? configuredChannels(this.config, this.model)
	}

	get definitionContext(): DefinitionContext {
		return { channelCount: this.channelCount, model: this.model }
	}

	async init(config: ModuleConfig): Promise<void> {
		UpdateVariableDefinitions(this)
		await this.configUpdated(config)
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}`)
		this.#closeConnection()
		this.updateStatus(InstanceStatus.Disconnected)
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		const previous = this.config as ModuleConfig | undefined
		this.config = config
		const reconnect = previous === undefined || previous.host !== config.host || previous.port !== config.port
		if (reconnect) {
			this.#closeConnection()
			this.state = new DeviceState()
		}
		this.updateDefinitions()
		if (reconnect) {
			this.setVariableValues(allValues(this.state, this.model, this.channelCount, config.isTalkingThreshold))
			this.checkAllFeedbacks()
			this.#openConnection()
			return
		}
		const connection = this.#connection
		if (connection) connection.messageGap = messageGap(config)
		if (previous.subscription !== config.subscription && connection?.isConnected) {
			this.sendBackground(command(Code.Subscribe, config.subscription))
		}
		if (previous.isTalkingThreshold !== config.isTalkingThreshold) {
			this.setVariableValues(talkingValues(this.state, this.channelCount, config.isTalkingThreshold))
		}
		if (connection?.isConnected) this.#startTimers()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	handleStartStopRecordActions(isRecording: boolean): void {
		this.isRecordingActions = isRecording
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	/** The action and feedback definitions, which follow the channel count and model. The variables don't */
	updateDefinitions(): void {
		this.updateActions()
		this.updateFeedbacks()
	}

	/**
	 * Queues a command for the unit, ahead of anything in the background
	 * @param signal an action's context.signal, so a command the user no longer wants is dropped before it is sent
	 * @throws if there is no connection
	 */
	async sendCommand(source: CommandSource, signal?: AbortSignal): Promise<void> {
		if (!this.#connection?.isConnected) throw new Error('Not connected to unit')
		await this.#connection.send(source, Priority.Action, signal)
	}

	/** Queues a command in the background, for something nothing waits on. Not sent if there is no connection */
	sendBackground(source: CommandSource): void {
		void this.#queueBackground(source)
	}

	/** As {@link sendBackground}, settling once the command is sent or dropped. Never rejects */
	async #queueBackground(source: CommandSource): Promise<void> {
		const connection = this.#connection
		if (!connection?.isConnected) return
		try {
			await connection.send(source, Priority.Background)
		} catch (err) {
			const text = typeof source === 'function' ? 'command' : source.text
			this.log('debug', `Not sent ${text}: ${errorMessage(err)}`)
		}
	}

	/**
	 * Asks for something once on this connection, however often it is called. For the feedbacks and action subscribe
	 * hooks that need a setting, which run again on every reconnection.
	 */
	request(query: Command): void {
		if (!this.#connection?.isConnected || this.#requested.has(query.text)) return
		this.#requested.add(query.text)
		this.sendBackground(query)
	}

	/**
	 * Turns unsolicited messages on, if they are not, so a feedback hears of changes made anywhere. Whatever the
	 * config says, as it always has.
	 */
	requireSubscription(): void {
		if (this.state.subscription !== 1) this.request(command(Code.Subscribe, 1))
	}

	#openConnection(): void {
		const host = this.config.host?.trim()
		if (!host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No host')
			return
		}
		const port = Number(this.config.port)
		if (!isWhole(port, 1, 65535)) {
			this.updateStatus(InstanceStatus.BadConfig, `Port ${String(this.config.port)} is not valid`)
			return
		}
		const connection = new DuganConnection({
			host,
			port,
			log: (level, message) => this.log(level, message),
			timing: { messageGap: messageGap(this.config), ...this.connectionTiming },
		})
		connection.on('status', (status, message) => this.updateStatus(status, message))
		connection.on('connected', () => this.#onConnected())
		connection.on('disconnected', () => this.#stopTimers())
		connection.on('reply', (reply) => HandleReply(this, reply))
		this.#connection = connection
		connection.connect()
	}

	#closeConnection(): void {
		this.#stopTimers()
		this.#connection?.destroy()
		this.#connection = undefined
		this.#requested.clear()
	}

	#onConnected(): void {
		this.#requested.clear()
		for (const code of QUERIES_ON_CONNECT) this.sendBackground(command(code))
		this.request(command(Code.Subscribe, this.config.subscription))
		void this.#queryNames()
		if (this.model === MODEL_M || this.model === MODEL_N) this.sendBackground(command(Code.MatrixBulk))
		// The variables show these, and nothing else would ask for them
		for (let channel = 1; channel <= this.channelCount; channel++) {
			this.request(channelQuery(Code.ChannelWeight, channel))
		}
		for (const group of GROUPS) {
			this.request(groupQuery(Code.GroupAutomixDepth, group))
			this.request(groupQuery(Code.GroupNomGainLimit, group))
			this.request(groupQuery(Code.GroupMusicThreshold, group))
		}
		// Settings may have changed while disconnected: the action subscribe hooks and feedback callbacks each ask again
		this.subscribeActions()
		this.checkAllFeedbacks()
		this.#startTimers()
	}

	/** Settles once every name query is sent or dropped */
	async #queryNames(): Promise<void> {
		const sent: Promise<void>[] = []
		for (let first = 1; first <= this.channelCount; first += NAMES_PER_QUERY) {
			const count = Math.min(NAMES_PER_QUERY, this.channelCount - first + 1)
			sent.push(this.#queueBackground(channelNames(first, count)))
		}
		await Promise.all(sent)
	}

	#startTimers(): void {
		this.#stopTimers()
		const { keepAlive, meterRate } = this.config
		if (keepAlive > 0) this.#pollTimer = setTimeout(() => this.#poll(), keepAlive * 1000)
		if (meterRate > 0) this.#meterTimer = setTimeout(() => this.#pollMeters(), meterRate)
	}

	#stopTimers(): void {
		clearTimeout(this.#pollTimer)
		clearTimeout(this.#meterTimer)
		this.#pollTimer = undefined
		this.#meterTimer = undefined
		this.#pollPending = false
		this.#meterPending = false
	}

	/** Scenes and channel names, which aren't reported when changed. Skipped while the last poll is still going */
	#poll(): void {
		if (!this.#pollPending) {
			this.#pollPending = true
			const sent = [
				this.#queueBackground(command(Code.SceneActive)),
				this.#queueBackground(command(Code.SceneCount)),
				this.#queryNames(),
			]
			void Promise.all(sent).finally(() => (this.#pollPending = false))
		}
		this.#pollTimer = setTimeout(() => this.#poll(), this.config.keepAlive * 1000)
	}

	/** Every meter in one query, for the units that answer it. Skipped while the last one is still waiting */
	#pollMeters(): void {
		if (!this.#meterPending && !MODELS_WITHOUT_METERS.includes(this.model)) {
			this.#meterPending = true
			void this.#queueBackground(command(Code.MeterStatus)).finally(() => (this.#meterPending = false))
		}
		this.#meterTimer = setTimeout(() => this.#pollMeters(), this.config.meterRate)
	}
}
