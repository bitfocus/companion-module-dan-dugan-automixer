/**
 * The Dugan control protocol is ASCII over TCP, on port 23 or 9776. A command is a code and comma separated
 * parameters, ending with EOM:
 *
 *     CM,3,1\r\n     set channel 3 to auto
 *     CM,3\r\n       ask for channel 3's mode
 *
 * A reply is the same with SOM in front, `*CM,3,1`, whether it answers a set or a query. With unsolicited messages
 * subscribed (`SU,1`) a change made from anywhere else is reported the same way. Several replies can share a line,
 * separated by REPLY_SEP. Three replies are binary, see {@link BINARY_LENGTH}.
 *
 * There is no protocol document to work from. Everything here is what the 1.x module sent and parsed, which was used
 * against Model M and Model N units.
 */
export const SOM = '*'
export const EOM = '\r\n'
export const PARAM_SEP = ','
export const REPLY_SEP = ';'

/** The command codes, as sent. Several are also the values saved on buttons by the query actions */
export enum Code {
	ChannelMode = 'CM',
	ChannelPreset = 'CP',
	ChannelBypass = 'BP',
	ChannelOverride = 'CO',
	ChannelWeight = 'CW',
	ChannelMusic = 'MR',
	ChannelNom = 'NE',
	ChannelGroup = 'GA',
	ChannelName = 'CN',
	ChannelNameList = 'CNS',
	ChannelBulk = 'GP',

	GroupMute = 'SM',
	GroupPreset = 'SP',
	GroupOverride = 'SO',
	GroupLastHold = 'LH',
	/** Answered as itself or as {@link Code.GroupAutomixDepthAlt}; the two are the same command */
	GroupAutomixDepth = 'ME',
	GroupAutomixDepthAlt = 'AD',
	GroupNomGainLimit = 'NL',
	GroupMusicThreshold = 'MT',
	GroupMusicInput = 'MC',

	MatrixMute = 'MXM',
	MatrixPolarity = 'MXP',
	MatrixGain = 'MXV',
	MatrixOutput = 'MXO',
	MatrixCrosspoint = 'OM',
	MatrixDefaults = 'RM',
	MatrixBulk = 'GM',

	/** Every meter and status flag in one binary reply. Model M and N, and some others */
	MeterStatus = 'GS',
	MeterAutomixGain = 'GSA',
	/** The Model N answers this with {@link Code.MeterSignalPresence} */
	MeterSignalClip = 'GSC',
	/** Signal presence on the E2A and E3A. The Model M and N use {@link Code.MeterSignalPresenceAlt} */
	MeterSignalPresence = 'GSS',
	MeterSignalPresenceAlt = 'GSP',
	MeterInputPeaks = 'GSI',
	MeterOutputPeaks = 'GSO',
	MeterMusicReference = 'GSM',
	MeterNomGain = 'GSN',
	MeterMatrixOutput = 'GSX',

	SceneCount = 'SNC',
	SceneActive = 'SNA',
	SceneRecall = 'SNR',
	SceneSave = 'SNS',
	SceneSaveNew = 'SNN',
	SceneRename = 'SNE',
	SceneDelete = 'SND',
	SceneList = 'SNL',
	ChannelDefaults = 'FP',

	Subscribe = 'SU',
	LinkGroup = 'LG',
	ClockSource = 'CS',
	AdatMirror = 'AM',
	AutomixChannels = 'CFN',
	ChannelOffset = 'CFS',
	BlinkMode = 'BM',
	Dhcp = 'DH',
	IpAddress = 'IP',
	Netmask = 'NM',
	Gateway = 'GW',
	SystemName = 'NA',
	SystemConfig = 'SC',
	Firmware = 'VE',
	Connections = 'CC',
	Resources = 'HW',
	SwitchHeadroom = 'HR',
	SampleRate = 'SF',
	Master = 'MM',
	Ping = 'PN',
	/** Reported by the unit. What it means is not documented */
	Pd = 'PD',
	/** Ends the session. Sent on its own, straight to the socket, as nothing follows it */
	EndSession = 'QUIT',
}

/** The replies that are binary after their header, by the header */
export const BINARY_HEADERS: Readonly<Record<string, BinaryCode>> = {
	[`${SOM}${Code.ChannelBulk}${PARAM_SEP}`]: Code.ChannelBulk,
	[`${SOM}${Code.MatrixBulk}${PARAM_SEP}`]: Code.MatrixBulk,
	[`${SOM}${Code.MeterStatus}${PARAM_SEP}`]: Code.MeterStatus,
}

export type BinaryCode = Code.ChannelBulk | Code.MatrixBulk | Code.MeterStatus
export const BINARY_CODES: readonly string[] = [Code.ChannelBulk, Code.MatrixBulk, Code.MeterStatus]

/** Every header in {@link BINARY_HEADERS} is this long */
export const BINARY_HEADER_LENGTH = 4

/**
 * How many bytes, header included, each binary reply is taken to be. The exact lengths aren't known. These are the
 * least the 1.x module accepted, and enough for every field it read (GM is two more than it checked for, as it read
 * that far). The reader takes this many bytes, then drops whatever is left of the chunk the block ended in, as the 1.x
 * module dropped the rest of the chunk. That has held up on hardware, where the unit sends each reply in one write.
 */
export const BINARY_LENGTH: Readonly<Record<BinaryCode, number>> = {
	[Code.ChannelBulk]: 438,
	[Code.MatrixBulk]: 886,
	[Code.MeterStatus]: 235,
}

/** A text line longer than this with no end is not a reply, and is dropped */
export const MAX_LINE_LENGTH = 2048

/** Replies whose parameters begin with one of these report that the command failed */
export const ERROR_PREFIX = /^error/i

export const MAX_CHANNELS = 64
export const MIN_CHANNELS = 8
export const GROUPS = [1, 2, 3] as const
export type GroupNumber = (typeof GROUPS)[number]
export const MATRICES = [1, 2, 3, 4, 5, 6] as const
export type MatrixNumber = (typeof MATRICES)[number]
/** Matrix inputs: the automix channels, then the 64 MADI or Dante inputs, then 8 ADAT inputs, with room to spare */
export const MATRIX_INPUTS = 144
/** Matrix outputs: 0 for none, the 64 MADI or Dante outputs, then 16 ADAT */
export const MAX_MATRIX_OUTPUT = MAX_CHANNELS + 16
/** Music system inputs run to the last mix bus, 86 */
export const MAX_MUSIC_INPUT = 86
/** Channel, scene and unit names */
export const MAX_NAME_LENGTH = 16
/** Characters that would end a parameter or a reply, so can't go in a name */
export const NAME_FORBIDDEN = /[,*;:\r\n]/

/** Each group's bit in the group mute, preset, override and last hold masks */
export const GROUP_BITS: Readonly<Record<GroupNumber, number>> = { 1: 1, 2: 2, 3: 4 }

/** The unit models, by the number the unit reports in its system configuration */
export const MODEL_NAMES: Readonly<Partial<Record<number, string>>> = {
	4: 'Model-E1',
	5: 'Dugan-MY16',
	6: 'Model-E1A',
	7: 'Model-E2',
	8: 'Model-E3',
	9: 'Model-VN',
	11: 'Model-M',
	12: 'Model-N',
}
export const MODEL_M = 11
export const MODEL_N = 12

/** Each model's automix channel count, where it is not {@link MIN_CHANNELS} */
export const MODEL_CHANNELS: Readonly<Partial<Record<number, number>>> = {
	5: 16,
	7: 28,
	8: 32,
	9: 16,
	11: 64,
	12: 64,
}

/** Models that don't answer {@link Code.MeterStatus}, so are not polled for meters */
export const MODELS_WITHOUT_METERS: readonly number[] = [4, 5, 6, 9]

/** Least time from sending one message to sending the next, by the config's messaging rate. Dugan advise 50 ms, but
 * units have crashed at that rate */
export const MESSAGE_GAP_MS = [55, 60, 70, 100] as const

/** Longest wait for the reply to a message before sending the next anyway */
export const REPLY_TIMEOUT_MS = 500

/** Replies missed in a row before the status says the unit isn't answering */
export const MISSED_REPLIES_WARNING = 3

/** Queue priorities: a higher one is sent first, and messages of the same priority in the order queued */
export enum Priority {
	/** Queries on connecting, polls, meters, and queries for feedbacks */
	Background = 0,
	/** Anything a user is waiting on, so a button press doesn't wait behind the queries on connecting */
	Action = 1,
}
