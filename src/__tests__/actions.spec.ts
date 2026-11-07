import { beforeEach, describe, expect, it } from 'vitest'
import {
	ActionIdChannel,
	ActionIdGroup,
	ActionIdMatrix,
	ActionIdScene,
	ActionIdSystem,
	UpdateActions,
} from '../actions.js'
import { decodeText } from '../api/decode.js'
import { NO_CHANGE, TOGGLE } from '../options.js'
import {
	actionDefinitions,
	fakeInstance,
	learnAction,
	runAction,
	sentTexts,
	subscribeAction,
	type FakeInstance,
} from './fixtures.js'

let fake: FakeInstance

function setUp(overrides: Parameters<typeof fakeInstance>[0] = {}) {
	fake = fakeInstance(overrides)
	UpdateActions(fake.self)
	return actionDefinitions(fake)
}

const run = async (actionId: string, options: Record<string, unknown>) =>
	runAction(actionDefinitions(fake), actionId, options as never)

const reply = (text: string) => fake.self.state.apply(decodeText(text))

beforeEach(() => {
	setUp()
})

describe('action definitions', () => {
	it('defines every action id', () => {
		const ids = [ActionIdChannel, ActionIdGroup, ActionIdMatrix, ActionIdScene, ActionIdSystem].flatMap((ids) =>
			Object.values(ids),
		)
		expect(Object.keys(actionDefinitions(fake)).sort()).toEqual(ids.sort())
	})

	it('offers as many channels as the unit has', () => {
		fake.self.state.apply(decodeText('*CFN,24'))
		UpdateActions(fake.self)
		const channel = actionDefinitions(fake)[ActionIdChannel.Mode]
		const option = channel ? channel.options.find((o) => o.id === 'channel') : undefined
		expect(option?.type === 'dropdown' && option.choices).toHaveLength(24)
	})

	it('labels inputs and outputs for the model', () => {
		const labels = (defs: ReturnType<typeof setUp>) => {
			const def = defs[ActionIdMatrix.Output]
			const option = def ? def.options.find((o) => o.id === 'output') : undefined
			return option?.type === 'dropdown' ? option.choices.map((c) => c.label) : []
		}
		expect(labels(setUp({ model: 12 }))[1]).toBe('Dante Output 1')
		expect(labels(setUp({ model: 11 }))[1]).toBe('MADI Output 1')
	})
})

describe('channel actions', () => {
	it('sets or queries a setting', async () => {
		await run(ActionIdChannel.Mode, { channel: 3, mode: 2, query: false })
		await run(ActionIdChannel.Mode, { channel: 3, mode: 2, query: true })
		await run(ActionIdChannel.GroupAssign, { channel: 4, group: 3, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['CM,3,2', 'CM,3', 'GA,4,3'])
	})

	it('passes the action signal on, so a command no longer wanted is dropped', async () => {
		const controller = new AbortController()
		await runAction(
			actionDefinitions(fake),
			ActionIdChannel.Mode,
			{ channel: 1, mode: 1, query: false },
			controller.signal,
		)
		expect(fake.sendCommand.mock.calls[0][1]).toBe(controller.signal)
	})

	it('sends nothing for a channel beyond the count, and says why', async () => {
		reply('*CFN,8')
		await run(ActionIdChannel.Mode, { channel: 9, mode: 1, query: false })
		expect(fake.sendCommand).not.toHaveBeenCalled()
		expect(fake.log).toHaveBeenCalledWith('warn', 'Channel 9 is not one of the 8 automix channels')
	})

	it('toggles from the setting the unit has when the command goes, not when it was queued', async () => {
		await run(ActionIdChannel.Bypass, { channel: 2, bypass: TOGGLE, query: false })
		const [[source]] = fake.sendCommand.mock.calls
		reply('*BP,2,1')
		expect(typeof source === 'function' && source()?.text).toBe('BP,2,0')
		reply('*BP,2,0')
		expect(typeof source === 'function' && source()?.text).toBe('BP,2,1')
	})

	it('sets on and off directly', async () => {
		reply('*NE,1,1')
		await run(ActionIdChannel.Nom, { channel: 1, nom: 1, query: false })
		await run(ActionIdChannel.Music, { channel: 1, music: 0, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['NE,1,1', 'MR,1,0'])
	})

	it('clamps the weight to what the unit takes', async () => {
		await run(ActionIdChannel.Weight, { channel: 1, weight: 40, query: false })
		await run(ActionIdChannel.Weight, { channel: 1, weight: -200, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['CW,1,15', 'CW,1,-100'])
	})

	it('steps the weight from the last reported, clamped', async () => {
		reply('*CW,5,14.5')
		await run(ActionIdChannel.WeightRelative, { channel: 5, weight: 1 })
		expect(sentTexts(fake.sendCommand)).toEqual(['CW,5,15'])
		reply('*CW,5,-3')
		fake.sendCommand.mockClear()
		await run(ActionIdChannel.WeightRelative, { channel: 5, weight: -0.5 })
		expect(sentTexts(fake.sendCommand)).toEqual(['CW,5,-3.5'])
	})

	it('steps from the weight the unit has when the command goes, so queued steps build on each other', async () => {
		reply('*CW,5,0')
		await run(ActionIdChannel.WeightRelative, { channel: 5, weight: 1 })
		await run(ActionIdChannel.WeightRelative, { channel: 5, weight: 1 })
		const [[first], [second]] = fake.sendCommand.mock.calls
		// The connection builds each in turn, the second after the reply to the first
		expect(typeof first === 'function' && first()?.text).toBe('CW,5,1')
		reply('*CW,5,1')
		expect(typeof second === 'function' && second()?.text).toBe('CW,5,2')
	})

	it('names a channel, up to the first forbidden character', async () => {
		await run(ActionIdChannel.Name, { channel: 2, name: 'Choir; left', query: false })
		await run(ActionIdChannel.Name, { channel: 2, name: ',', query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['CN,2,Choir'])
		expect(fake.log).toHaveBeenCalledWith('warn', 'Not a valid channel name: ","')
	})

	it('learns only the setting, from what the unit reported', async () => {
		reply('*CO,6,1')
		reply('*CM,6,0')
		const defs = actionDefinitions(fake)
		expect(await learnAction(defs, ActionIdChannel.Override, { channel: 6, override: 0, query: false })).toEqual({
			override: 1,
		})
		expect(await learnAction(defs, ActionIdChannel.Mode, { channel: 6, mode: 1, query: false })).toEqual({ mode: 0 })
	})

	it('asks for the setting when added, so toggles and learn have it', () => {
		subscribeAction(actionDefinitions(fake), ActionIdChannel.Bypass, { channel: 7, bypass: 1, query: false })
		subscribeAction(actionDefinitions(fake), ActionIdChannel.Bypass, { channel: 99, bypass: 1, query: false })
		expect(fake.request.mock.calls.map(([query]) => query.text)).toEqual(['BP,7'])
	})
})

describe('group actions', () => {
	it('builds the mask from each group, toggling and leaving alone from what the unit has', async () => {
		reply('*SM,6') // B and C muted
		await run(ActionIdGroup.Mute, { groupA: 1, groupB: TOGGLE, groupC: NO_CHANGE, query: false })
		await run(ActionIdGroup.Mute, { groupA: 0, groupB: NO_CHANGE, groupC: TOGGLE, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['SM,5', 'SM,2'])
	})

	it('queries the mask', async () => {
		await run(ActionIdGroup.LastHold, { groupA: 0, groupB: 0, groupC: 0, query: true })
		expect(sentTexts(fake.sendCommand)).toEqual(['LH'])
	})

	it('learns each group as its bit', async () => {
		reply('*SO,3')
		expect(
			await learnAction(actionDefinitions(fake), ActionIdGroup.Override, {
				groupA: 0,
				groupB: 0,
				groupC: 0,
				query: false,
			}),
		).toEqual({ groupA: 1, groupB: 2, groupC: 0 })
	})

	it('sets and steps levels within range', async () => {
		reply('*ME,2,-1')
		await run(ActionIdGroup.AutomixDepth, { group: 1, depth: -20, query: false })
		await run(ActionIdGroup.AutomixDepthRelative, { group: 2, depth: 3 })
		reply('*NL,3,9.5')
		await run(ActionIdGroup.NomGainLimitRelative, { group: 3, nomgain: 2 })
		await run(ActionIdGroup.MusicThreshold, { group: 1, threshold: 0, query: true })
		expect(sentTexts(fake.sendCommand)).toEqual(['ME,1,-20', 'ME,2,0', 'NL,3,10', 'MT,1'])
	})

	it('sends nothing for a group that is not one', async () => {
		await run(ActionIdGroup.NomGainLimit, { group: 4, nomgain: 2, query: false })
		expect(fake.sendCommand).not.toHaveBeenCalled()
		expect(fake.log).toHaveBeenCalledWith('warn', '4 is not a group number, 1 to 3')
	})

	it('checks the music system input', async () => {
		await run(ActionIdGroup.MusicInput, { group: 1, input: 81, query: false })
		await run(ActionIdGroup.MusicInput, { group: 1, input: 87, query: false })
		await run(ActionIdGroup.MusicInput, { group: 1, input: 87, query: true })
		expect(sentTexts(fake.sendCommand)).toEqual(['MC,1,81', 'MC,1'])
	})
})

describe('matrix actions', () => {
	it('toggles mute and polarity from what the unit has', async () => {
		reply('*MXM,2,1')
		await run(ActionIdMatrix.Mute, { matrix: 2, mute: TOGGLE, query: false })
		await run(ActionIdMatrix.Polarity, { matrix: 2, polarity: TOGGLE, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['MXM,2,0', 'MXP,2,1'])
	})

	it('sets and steps the gain within range', async () => {
		reply('*MXV,1,14')
		await run(ActionIdMatrix.Gain, { matrix: 1, gain: -30, query: false })
		await run(ActionIdMatrix.GainRelative, { matrix: 1, gain: 2 })
		expect(sentTexts(fake.sendCommand)).toEqual(['MXV,1,-25', 'MXV,1,15'])
	})

	it('sets and steps a crosspoint within range', async () => {
		reply('*OM,4,70,-95')
		await run(ActionIdMatrix.Crosspoint, { matrix: 4, channel: 70, gain: 3, query: false })
		await run(ActionIdMatrix.CrosspointRelative, { matrix: 4, channel: 70, gain: -6 })
		await run(ActionIdMatrix.Crosspoint, { matrix: 4, channel: 70, gain: 0, query: true })
		expect(sentTexts(fake.sendCommand)).toEqual(['OM,4,70,0', 'OM,4,70,-96', 'OM,4,70'])
	})

	it('checks the matrix, input and output', async () => {
		await run(ActionIdMatrix.Crosspoint, { matrix: 7, channel: 1, gain: 0, query: false })
		await run(ActionIdMatrix.Crosspoint, { matrix: 1, channel: 145, gain: 0, query: false })
		await run(ActionIdMatrix.Output, { matrix: 1, output: 81, query: false })
		await run(ActionIdMatrix.Output, { matrix: 1, output: 0, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['MXO,1,0'])
	})

	it('learns a crosspoint', async () => {
		reply('*OM,1,3,-12')
		expect(
			await learnAction(actionDefinitions(fake), ActionIdMatrix.Crosspoint, {
				matrix: 1,
				channel: 3,
				gain: 0,
				query: false,
			}),
		).toEqual({ gain: -12 })
	})
})

describe('scene actions', () => {
	it('lists the scenes the unit has', () => {
		reply('*SNL,1,2,2,Sunday,Wedding')
		UpdateActions(fake.self)
		const def = actionDefinitions(fake)[ActionIdScene.Recall]
		const option = def ? def.options[0] : undefined
		expect(option?.type === 'dropdown' && option.choices).toEqual([
			{ id: 'Sunday', label: 'Sunday' },
			{ id: 'Wedding', label: 'Wedding' },
		])
	})

	it('sends scene commands', async () => {
		await run(ActionIdScene.Recall, { name: 'Sunday' })
		await run(ActionIdScene.Rename, { currentname: 'Sunday', newname: 'Sunday AM' })
		await run(ActionIdScene.SaveNew, {})
		await run(ActionIdScene.Count, {})
		await run(ActionIdScene.RecallDefaults, { mode: 'RM' })
		expect(sentTexts(fake.sendCommand)).toEqual(['SNR,Sunday', 'SNE,Sunday,Sunday AM', 'SNN', 'SNC', 'RM'])
	})

	it('refuses a name with nothing usable, or a defaults choice no longer offered', async () => {
		await run(ActionIdScene.Delete, { name: ';' })
		await run(ActionIdScene.RecallDefaults, { mode: 'XX' })
		expect(fake.sendCommand).not.toHaveBeenCalled()
		expect(fake.log).toHaveBeenCalledTimes(2)
	})
})

describe('system actions', () => {
	it('sets or queries a setting', async () => {
		await run(ActionIdSystem.LinkGroup, { linkgroup: 12, query: false })
		await run(ActionIdSystem.LinkGroup, { linkgroup: 12, query: true })
		await run(ActionIdSystem.Subscribe, { subscribe: 0, query: false })
		await run(ActionIdSystem.AutomixChannels, { channels: 32, query: false })
		await run(ActionIdSystem.Name, { name: 'Booth', query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['LG,12', 'LG', 'SU,0', 'CFN,32', 'NA,Booth'])
	})

	it('checks ranges', async () => {
		await run(ActionIdSystem.LinkGroup, { linkgroup: 255, query: false })
		await run(ActionIdSystem.AutomixChannels, { channels: 4, query: false })
		reply('*CFN,60')
		await run(ActionIdSystem.ChannelOffset, { offset: 6, query: false })
		await run(ActionIdSystem.ChannelOffset, { offset: 5, query: false })
		expect(sentTexts(fake.sendCommand)).toEqual(['CFS,5'])
	})

	it('sends a network address, and refuses a bad one', async () => {
		await run(ActionIdSystem.Network, { mode: 'NM', IP: '255.255.0.0' })
		await run(ActionIdSystem.Network, { mode: 'IP', IP: '10.0.0' })
		expect(sentTexts(fake.sendCommand)).toEqual(['NM,255,255,0,0'])
		expect(fake.log).toHaveBeenCalledWith('warn', 'Not a valid address: 10.0.0 is not a valid IPv4 address')
	})

	it('sends the query chosen, if it is still one of the choices', async () => {
		await run(ActionIdSystem.QuerySystem, { mode: 'VE' })
		await run(ActionIdSystem.QueryMeters, { mode: 'GSS' })
		await run(ActionIdSystem.QueryBulkConfig, { mode: 'GP' })
		await run(ActionIdSystem.QueryMeters, { mode: 'GSC' })
		expect(sentTexts(fake.sendCommand)).toEqual(['VE', 'GSS', 'GP'])
	})

	it('asks for a block of channel or scene names', async () => {
		await run(ActionIdSystem.QueryNameList, { mode: 'CNS', first: 1, count: 16 })
		await run(ActionIdSystem.QueryNameList, { mode: 'SNL', first: 1, count: 4 })
		await run(ActionIdSystem.QueryNameList, { mode: 'CNS', first: 60, count: 16 })
		expect(sentTexts(fake.sendCommand)).toEqual(['CNS,1,16', 'SNL,1,4'])
	})
})

describe('every action sends its command', () => {
	// What each sends, as the 1.x module sent it, for a set and for a query where it has one
	const cases: [string, Record<string, unknown>, string][] = [
		[ActionIdChannel.Mode, { channel: 2, mode: 0, query: false }, 'CM,2,0'],
		[ActionIdChannel.Preset, { channel: 2, preset: 2, query: false }, 'CP,2,2'],
		[ActionIdChannel.Preset, { channel: 2, preset: 2, query: true }, 'CP,2'],
		[ActionIdChannel.Bypass, { channel: 2, bypass: 1, query: true }, 'BP,2'],
		[ActionIdChannel.Override, { channel: 2, override: 1, query: false }, 'CO,2,1'],
		[ActionIdChannel.Override, { channel: 2, override: 1, query: true }, 'CO,2'],
		[ActionIdChannel.Weight, { channel: 2, weight: 3, query: true }, 'CW,2'],
		[ActionIdChannel.Music, { channel: 2, music: 1, query: true }, 'MR,2'],
		[ActionIdChannel.Nom, { channel: 2, nom: TOGGLE, query: false }, 'NE,2,1'],
		[ActionIdChannel.Nom, { channel: 2, nom: 1, query: true }, 'NE,2'],
		[ActionIdChannel.GroupAssign, { channel: 2, group: 1, query: true }, 'GA,2'],
		[ActionIdChannel.Name, { channel: 2, name: 'x', query: true }, 'CN,2'],
		[ActionIdGroup.Preset, { groupA: 1, groupB: 2, groupC: 4, query: false }, 'SP,7'],
		[ActionIdGroup.Override, { groupA: 0, groupB: 2, groupC: 0, query: false }, 'SO,2'],
		[ActionIdGroup.LastHold, { groupA: TOGGLE, groupB: 0, groupC: 0, query: false }, 'LH,1'],
		[ActionIdGroup.AutomixDepth, { group: 3, depth: -15, query: true }, 'ME,3'],
		[ActionIdGroup.NomGainLimit, { group: 1, nomgain: 0, query: false }, 'NL,1,1'],
		[ActionIdGroup.MusicThreshold, { group: 2, threshold: 40, query: false }, 'MT,2,15'],
		[ActionIdGroup.MusicThresholdRelative, { group: 2, threshold: -1 }, 'MT,2,-11'],
		[ActionIdMatrix.Mute, { matrix: 1, mute: 1, query: true }, 'MXM,1'],
		[ActionIdMatrix.Polarity, { matrix: 1, polarity: 0, query: false }, 'MXP,1,0'],
		[ActionIdMatrix.Polarity, { matrix: 1, polarity: 0, query: true }, 'MXP,1'],
		[ActionIdMatrix.Gain, { matrix: 5, gain: -6, query: true }, 'MXV,5'],
		[ActionIdMatrix.Output, { matrix: 5, output: 3, query: true }, 'MXO,5'],
		[ActionIdScene.Active, {}, 'SNA'],
		[ActionIdScene.Save, { name: 'Wedding' }, 'SNS,Wedding'],
		[ActionIdScene.Delete, { name: 'Wedding' }, 'SND,Wedding'],
		[ActionIdScene.RecallDefaults, { mode: 'FP' }, 'FP'],
		[ActionIdSystem.Subscribe, { subscribe: 1, query: true }, 'SU'],
		[ActionIdSystem.ClockSource, { clock: 2, query: false }, 'CS,2'],
		[ActionIdSystem.ClockSource, { clock: 2, query: true }, 'CS'],
		[ActionIdSystem.AdatMirror, { mirror: 2, query: false }, 'AM,2'],
		[ActionIdSystem.AdatMirror, { mirror: 2, query: true }, 'AM'],
		[ActionIdSystem.AutomixChannels, { channels: 8, query: true }, 'CFN'],
		[ActionIdSystem.ChannelOffset, { offset: 1, query: true }, 'CFS'],
		[ActionIdSystem.BlinkMode, { blink: 0, query: false }, 'BM,0'],
		[ActionIdSystem.Dhcp, { dhcp: 1, query: false }, 'DH,1'],
		[ActionIdSystem.Dhcp, { dhcp: 1, query: true }, 'DH'],
		[ActionIdSystem.Name, { name: 'x', query: true }, 'NA'],
	]

	it.each(cases)('%s %j sends %s', async (actionId, options, expected) => {
		reply('*NL,1,1')
		await run(actionId, options)
		expect(sentTexts(fake.sendCommand)).toEqual([expected])
	})

	it.each([
		[ActionIdChannel.Preset, { channel: 0, preset: 1, query: false }],
		[ActionIdChannel.Override, { channel: 0, override: 1, query: false }],
		[ActionIdChannel.Weight, { channel: 0, weight: 1, query: false }],
		[ActionIdChannel.WeightRelative, { channel: 0, weight: 1 }],
		[ActionIdChannel.Music, { channel: 0, music: 1, query: false }],
		[ActionIdChannel.Nom, { channel: 0, nom: 1, query: false }],
		[ActionIdChannel.GroupAssign, { channel: 0, group: 1, query: false }],
		[ActionIdChannel.Name, { channel: 0, name: 'x', query: false }],
		[ActionIdChannel.Bypass, { channel: 0, bypass: 1, query: false }],
		[ActionIdGroup.AutomixDepthRelative, { group: 0, depth: 1 }],
		[ActionIdGroup.MusicInput, { group: 0, input: 1, query: false }],
		[ActionIdMatrix.Mute, { matrix: 0, mute: 1, query: false }],
		[ActionIdMatrix.Polarity, { matrix: 0, polarity: 1, query: false }],
		[ActionIdMatrix.Gain, { matrix: 0, gain: 1, query: false }],
		[ActionIdMatrix.GainRelative, { matrix: 0, gain: 1 }],
		[ActionIdMatrix.Output, { matrix: 0, output: 1, query: false }],
		[ActionIdMatrix.CrosspointRelative, { matrix: 1, channel: 0, gain: 1 }],
		[ActionIdSystem.ClockSource, { clock: 4, query: false }],
		[ActionIdSystem.AdatMirror, { mirror: 3, query: false }],
		[ActionIdSystem.QueryNameList, { mode: 'XX', first: 1, count: 1 }],
		[ActionIdSystem.Network, { mode: 'XX', IP: '10.0.0.1' }],
	])('%s %j sends nothing', async (actionId, options) => {
		await run(actionId, options)
		expect(fake.sendCommand).not.toHaveBeenCalled()
		expect(fake.log).toHaveBeenCalledWith('warn', expect.any(String))
	})

	it('learns every setting it can', async () => {
		reply('*CP,1,0')
		reply('*CW,1,4')
		reply('*BP,1,1')
		reply('*MR,1,1')
		reply('*NE,1,1')
		reply('*GA,1,2')
		reply('*CN,1,Lectern')
		reply('*SP,2')
		reply('*NL,1,3')
		reply('*MT,1,-4')
		reply('*MC,1,65')
		reply('*MXP,1,1')
		reply('*MXV,1,-2')
		reply('*MXO,1,66')
		const defs = actionDefinitions(fake)
		const learn = async (id: string, options: Record<string, unknown>) => learnAction(defs, id, options as never)
		expect(await learn(ActionIdChannel.Preset, { channel: 1 })).toEqual({ preset: 0 })
		expect(await learn(ActionIdChannel.Weight, { channel: 1 })).toEqual({ weight: 4 })
		expect(await learn(ActionIdChannel.Bypass, { channel: 1 })).toEqual({ bypass: 1 })
		expect(await learn(ActionIdChannel.Music, { channel: 1 })).toEqual({ music: 1 })
		expect(await learn(ActionIdChannel.Nom, { channel: 1 })).toEqual({ nom: 1 })
		expect(await learn(ActionIdChannel.GroupAssign, { channel: 1 })).toEqual({ group: 2 })
		expect(await learn(ActionIdChannel.Name, { channel: 1 })).toEqual({ name: 'Lectern' })
		expect(await learn(ActionIdChannel.Mode, { channel: 99 })).toBeUndefined()
		expect(await learn(ActionIdGroup.Preset, {})).toEqual({ groupA: 0, groupB: 2, groupC: 0 })
		expect(await learn(ActionIdGroup.AutomixDepth, { group: 1 })).toEqual({ depth: -15 })
		expect(await learn(ActionIdGroup.NomGainLimit, { group: 1 })).toEqual({ nomgain: 3 })
		expect(await learn(ActionIdGroup.MusicThreshold, { group: 1 })).toEqual({ threshold: -4 })
		expect(await learn(ActionIdGroup.MusicInput, { group: 1 })).toEqual({ input: 65 })
		expect(await learn(ActionIdGroup.MusicInput, { group: 4 })).toBeUndefined()
		expect(await learn(ActionIdMatrix.Mute, { matrix: 1 })).toEqual({ mute: 0 })
		expect(await learn(ActionIdMatrix.Polarity, { matrix: 1 })).toEqual({ polarity: 1 })
		expect(await learn(ActionIdMatrix.Gain, { matrix: 1 })).toEqual({ gain: -2 })
		expect(await learn(ActionIdMatrix.Output, { matrix: 1 })).toEqual({ output: 66 })
	})

	it('asks for each setting a toggle, step or learn reads, when the action is added', () => {
		const defs = actionDefinitions(fake)
		subscribeAction(defs, ActionIdGroup.Mute, {})
		subscribeAction(defs, ActionIdGroup.NomGainLimitRelative, { group: 2 })
		subscribeAction(defs, ActionIdGroup.MusicInput, { group: 9 })
		subscribeAction(defs, ActionIdMatrix.Gain, { matrix: 3 })
		subscribeAction(defs, ActionIdMatrix.CrosspointRelative, { matrix: 3, channel: 140 })
		subscribeAction(defs, ActionIdMatrix.CrosspointRelative, { matrix: 3, channel: 145 })
		expect(fake.request.mock.calls.map(([query]) => query.text)).toEqual(['SM', 'NL,2', 'MXV,3', 'OM,3,140'])
	})
})
