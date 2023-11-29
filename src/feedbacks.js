const { combineRgb, Regex } = require('@companion-module/base')
const { paramSep } = require('./consts')

module.exports = async function (self) {
	self.setFeedbackDefinitions({
		sceneChanged: {
			name: 'Scene, Has Changed',
			type: 'boolean',
			label: 'Scene, Has Changed',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [],
			callback: () => {
				if (self.sceneChanged == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				self.addCmdtoQueue('SNA')
				self.checkSubscriptionLevel(1)
			},
		},
		matrixLevel: {
			name: 'Matrix Output Level',
			type: 'boolean',
			label: 'Matrix Output Level',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Matrix',
					id: 'matrix',
					default: 1,
					choices: self.matrixNames,
				},
				{
					type: 'number',
					label: 'Less than or equal to',
					id: 'lessThan',
					default: 0,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
				{
					type: 'number',
					label: 'Greater than or equal to',
					id: 'greaterThan',
					default: -12,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
			],
			callback: ({ options }) => {
				if (
					self.matrixOutputPeak[options.matrix] <= options.lessThan &&
					self.matrixOutputPeak[options.matrix] >= options.greaterThan
				) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSX')
				}
				self.checkSubscriptionLevel(1)
			},
		},
		matrixMuted: {
			name: 'Matrix Output Mute',
			type: 'boolean',
			label: 'Matrix Output Mute',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Matrix',
					id: 'matrix',
					default: 1,
					choices: self.matrixNames,
				},
			],
			callback: ({ options }) => {
				if (self.matrixMute[options.matrix] == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('MXM' + paramSep + options.matrix)
				self.checkSubscriptionLevel(1)
			},
		},
		matrixPolarity: {
			name: 'Matrix Output Polarity',
			type: 'boolean',
			label: 'Matrix Output Polarity',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Matrix',
					id: 'matrix',
					default: 1,
					choices: self.matrixNames,
				},
			],
			callback: ({ options }) => {
				if (self.matrixPolarity[options.matrix] == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('MXP' + paramSep + options.matrix)
				self.checkSubscriptionLevel(1)
			},
		},
		channelMode: {
			name: 'Channel Mode',
			type: 'boolean',
			label: 'Channel Mode',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 1,
					choices: self.channel_modes,
				},
			],
			callback: ({ options }) => {
				if (self.channelsMode[options.channel] == options.mode) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('CM' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelPreset: {
			name: 'Channel Preset',
			type: 'boolean',
			label: 'Channel Preset',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					default: 1,
					choices: self.channel_modes,
				},
			],
			callback: ({ options }) => {
				if (self.channelsPreset[options.channel] == options.preset) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('CP' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelBypass: {
			name: 'Channel Bypass',
			type: 'boolean',
			label: 'Channel Bypass',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsBypass[options.channel] == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('BP' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelOverride: {
			name: 'Channel Override',
			type: 'boolean',
			label: 'Channel Override',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsOverride[options.channel] == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('CO' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelMusic: {
			name: 'Channel Music Mode',
			type: 'boolean',
			label: 'Channel Music Mode',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsMusic[options.channel] == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('MR' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelNOM: {
			name: 'Channel NOM Mode',
			type: 'boolean',
			label: 'Channel NOM Mode',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsNom[options.channel] == 1) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('NE' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelGroupAssign: {
			name: 'Channel Group Assignment',
			type: 'boolean',
			label: 'Channel Group Assignment',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsGroupAssign[options.channel] == options.group) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('GA' + paramSep + options.channel)
				self.checkSubscriptionLevel(1)
			},
		},
		channelClip: {
			name: 'Channel Clip',
			type: 'boolean',
			label: 'Channel Clip',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsClip[options.channel]) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSC')
				}
				self.checkSubscriptionLevel(2)
			},
		},
		channelPresence: {
			name: 'Channel Signal Presence',
			type: 'boolean',
			label: 'Channel Signal Presence',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
			],
			callback: ({ options }) => {
				if (self.channelsPresence[options.channel]) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSS')
				}
				self.checkSubscriptionLevel(1) // should be 2 if SU behaved properly
			},
		},
		channelInputPeak: {
			name: 'Channel Input Peak Meter',
			type: 'boolean',
			label: 'Channel Input Peak Meter',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
				{
					type: 'number',
					label: 'Less than or equal to',
					id: 'lessThan',
					default: 0,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
				{
					type: 'number',
					label: 'Greater than or equal to',
					id: 'greaterThan',
					default: -12,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
			],
			callback: ({ options }) => {
				if (
					self.channelsInputPeak[options.channel] <= options.lessThan &&
					self.channelsInputPeak[options.channel] >= options.greaterThan
				) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSI')
				}
				self.checkSubscriptionLevel(1) // should be 2 if SU behaved properly
			},
		},
		channelOutputPeak: {
			name: 'Channel Output Peak Meter',
			type: 'boolean',
			label: 'Channel Output Peak Meter',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
				{
					type: 'number',
					label: 'Less than or equal to',
					id: 'lessThan',
					default: 0,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
				{
					type: 'number',
					label: 'Greater than or equal to',
					id: 'greaterThan',
					default: -12,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
			],
			callback: ({ options }) => {
				if (
					self.channelsOutputPeak[options.channel] <= options.lessThan &&
					self.channelsOutputPeak[options.channel] >= options.greaterThan
				) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSO')
				}
				self.checkSubscriptionLevel(1) // should be 2 if SU behaved properly
			},
		},
		channelAmixGain: {
			name: 'Channel Automix Gain Reduction',
			type: 'boolean',
			label: 'Channel Automix Gain Reduction',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Channel',
					id: 'channel',
					default: 1,
					choices: self.channelNames,
				},
				{
					type: 'number',
					label: 'Less than or equal to',
					id: 'lessThan',
					default: 0,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
				{
					type: 'number',
					label: 'Greater than or equal to',
					id: 'greaterThan',
					default: -12,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
			],
			callback: ({ options }) => {
				if (
					self.channelsAmixGain[options.channel] <= options.lessThan &&
					self.channelsAmixGain[options.channel] >= options.greaterThan
				) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSA')
				}
				self.checkSubscriptionLevel(1) // should be 2 if SU behaved properly
			},
		},
		groupMute: {
			name: 'Group Mute',
			type: 'boolean',
			label: 'Group Mute',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
			],
			callback: ({ options }) => {
				if (self.groupMute[options.group] != 0) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				self.addCmdtoQueue('SM')
				self.checkSubscriptionLevel(1)
			},
		},
		groupPreset: {
			name: 'Group Preset',
			type: 'boolean',
			label: 'Group Preset',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
			],
			callback: ({ options }) => {
				if (self.groupPreset[options.group] != 0) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				self.addCmdtoQueue('SP')
				self.checkSubscriptionLevel(1)
			},
		},
		groupOverride: {
			name: 'Group Override',
			type: 'boolean',
			label: 'Group Override',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
			],
			callback: ({ options }) => {
				if (self.groupOverride[options.group] != 0) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				self.addCmdtoQueue('SO')
				self.checkSubscriptionLevel(1)
			},
		},
		groupLastHold: {
			name: 'Group Last Hold',
			type: 'boolean',
			label: 'Group Last Hold',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
			],
			callback: ({ options }) => {
				if (self.groupLastHold[options.group] != 0) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				self.addCmdtoQueue('LH')
				self.checkSubscriptionLevel(1)
			},
		},
		groupNOMgain: {
			name: 'Group NOM Gain Reduction',
			type: 'boolean',
			label: 'Group NOM Gain Reduction',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
				{
					type: 'number',
					label: 'Less than or equal to',
					id: 'lessThan',
					default: 0,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
				{
					type: 'number',
					label: 'Greater than or equal to',
					id: 'greaterThan',
					default: -12,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
			],
			callback: ({ options }) => {
				if (
					self.groupNOMpeak[options.group] <= options.lessThan &&
					self.groupNOMpeak[options.group] >= options.greaterThan
				) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSN')
				}
				self.checkSubscriptionLevel(2)
			},
		},
		groupMusicPeak: {
			name: 'Group Music System Gain Reduction',
			type: 'boolean',
			label: 'Group Music System Gain Reduction',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
				{
					type: 'number',
					label: 'Less than or equal to',
					id: 'lessThan',
					default: 0,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
				{
					type: 'number',
					label: 'Greater than or equal to',
					id: 'greaterThan',
					default: -12,
					max: 0,
					min: -128,
					range: true,
					step: 0.1,
					required: true,
					regex: Regex.NUMBER,
				},
			],
			callback: ({ options }) => {
				if (
					self.groupMusicPeak[options.group] <= options.lessThan &&
					self.groupMusicPeak[options.group] >= options.greaterThan
				) {
					return true
				} else {
					return false
				}
			},
			subscribe: () => {
				if (self.config.model != 11 && self.config.model != 12) {
					self.addCmdtoQueue('GSM')
				}
				self.checkSubscriptionLevel(1) // should be 2 if SU behaved properly
			},
		},
		groupMusicInput: {
			name: 'Group Music System Threshold Input',
			type: 'boolean',
			label: 'Group Music System Threshold Input',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Group',
					id: 'group',
					default: 1,
					choices: self.groupNames,
				},
				{
					id: 'input',
					type: 'dropdown',
					label: 'Music System Threshold Input',
					default: 1,
					choices: self.musicInputs,
				},
			],
			callback: ({ options }) => {
				if (self.groupMusicInput[options.group] == options.input) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('MC' + paramSep + options.group)
				self.checkSubscriptionLevel(1)
			},
			learn: async (feedback) => {
				let cmd = 'MC'
				self.addCmdtoQueue(cmd + paramSep + feedback.options.group)
				const grpMTinput = self.groupMusicInput[feedback.options.group]
				return {
					...feedback.options,
					input: grpMTinput,
				}
			},
		},
		matrixOutput: {
			name: 'Matrix Output Route',
			type: 'boolean',
			label: 'Matrix Output Route',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'Matrix',
					id: 'matrix',
					default: 1,
					choices: self.matrixNames,
				},
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output',
					default: 1,
					choices: self.matrixDestinations,
				},
			],
			callback: ({ options }) => {
				if (self.matrixOutput[options.matrix] == options.output) {
					return true
				} else {
					return false
				}
			},
			subscribe: ({ options }) => {
				self.addCmdtoQueue('MXO' + paramSep + options.matrix)
				self.checkSubscriptionLevel(1)
			},
			learn: async (feedback) => {
				let cmd = 'MXO'
				self.addCmdtoQueue(cmd + paramSep + feedback.options.matrix)
				const matrixOutput = self.matrixOutput[feedback.options.matrix]
				return {
					...feedback.options,
					output: matrixOutput,
				}
			},
		},
	})
}