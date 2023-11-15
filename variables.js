module.exports = async function (self) {
	self.setVariableDefinitions([
		{ variableId: 'deviceType', name: 'Device Type' },
		{ variableId: 'hostName', name: 'Host Name' },
		{ variableId: 'serialNumber', name: 'Serial Number' },
		{ variableId: 'firmwareVersion', name: 'Firmware Version' },
		{ variableId: 'firmwareSecVersion', name: 'Secondary Firmware Version' },
		{ variableId: 'fpgaVersion', name: 'FPGA Version' },
		{ variableId: 'hardwareRevsion', name: 'Hardware Revsion' },
		{ variableId: 'macAddress', name: 'MAC Address' },
		{ variableId: 'ipAddress', name: 'IP Address' },
		{ variableId: 'netMask', name: 'Subnet Mask' },
		{ variableId: 'gateway', name: 'Gateway' },
		{ variableId: 'dhcp', name: 'DHCP' },
		{ variableId: 'channelCount', name: 'Channel Count' },
		{ variableId: 'linkGroup', name: 'Link Group' },
		{ variableId: 'clockSource', name: 'Clock Source' },
		{ variableId: 'adatMirror', name: 'ADAT Mirror' },
		{ variableId: 'inputOffset', name: 'Input Channel Offset' },
		{ variableId: 'blinkMode', name: 'Blink Mode' },
		{ variableId: 'clientUDP', name: 'UDP Clients' },
		{ variableId: 'clientTCP', name: 'TCP Clients' },
		{ variableId: 'sampleRate', name: 'Sample Rate' },
		{ variableId: 'switchHeadroom', name: 'Switch Headroom' },
		{ variableId: 'master', name: 'Master' },
		{ variableId: 'heartBeat', name: 'HeartBeat' },
		{ variableId: 'lwip', name: 'LWIP' },
		{ variableId: 'dsp', name: 'DSP' },
		{ variableId: 'tcpip', name: 'TCPIP' },
		{ variableId: 'macRX', name: 'Mac RX' },
		{ variableId: 'macTX', name: 'Mac TX' },
		{ variableId: 'rtosHeapFree', name: 'RTOS Heap Free' },
		{ variableId: 'mallocHeadFree', name: 'Malloc Heap Free' },
		{ variableId: 'sceneCount', name: 'Scene Count' },
		{ variableId: 'sceneActive', name: 'Active Scene' },
		{ variableId: 'sceneActiveIndex', name: 'Active Scene Index' },
		{ variableId: 'sceneActiveChanged', name: 'Active Scene Changed' },
		{ variableId: 'channelName1', name: 'Channel 1 Name' },
		{ variableId: 'channelName2', name: 'Channel 2 Name' },
		{ variableId: 'channelName3', name: 'Channel 3 Name' },
		{ variableId: 'channelName4', name: 'Channel 4 Name' },
		{ variableId: 'channelName5', name: 'Channel 5 Name' },
		{ variableId: 'channelName6', name: 'Channel 6 Name' },
		{ variableId: 'channelName7', name: 'Channel 7 Name' },
		{ variableId: 'channelName8', name: 'Channel 8 Name' },
		{ variableId: 'channelName9', name: 'Channel 9 Name' },
		{ variableId: 'channelName10', name: 'Channel 10 Name' },
		{ variableId: 'channelName11', name: 'Channel 11 Name' },
		{ variableId: 'channelName12', name: 'Channel 12 Name' },
		{ variableId: 'channelName13', name: 'Channel 13 Name' },
		{ variableId: 'channelName14', name: 'Channel 14 Name' },
		{ variableId: 'channelName15', name: 'Channel 15 Name' },
		{ variableId: 'channelName16', name: 'Channel 16 Name' },
		{ variableId: 'channelName17', name: 'Channel 17 Name' },
		{ variableId: 'channelName18', name: 'Channel 18 Name' },
		{ variableId: 'channelName19', name: 'Channel 19 Name' },
		{ variableId: 'channelName20', name: 'Channel 20 Name' },
		{ variableId: 'channelName21', name: 'Channel 21 Name' },
		{ variableId: 'channelName22', name: 'Channel 22 Name' },
		{ variableId: 'channelName23', name: 'Channel 23 Name' },
		{ variableId: 'channelName24', name: 'Channel 24 Name' },
		{ variableId: 'channelName25', name: 'Channel 25 Name' },
		{ variableId: 'channelName26', name: 'Channel 26 Name' },
		{ variableId: 'channelName27', name: 'Channel 27 Name' },
		{ variableId: 'channelName28', name: 'Channel 28 Name' },
		{ variableId: 'channelName29', name: 'Channel 29 Name' },
		{ variableId: 'channelName30', name: 'Channel 30 Name' },
		{ variableId: 'channelName31', name: 'Channel 31 Name' },
		{ variableId: 'channelName32', name: 'Channel 32 Name' },
		{ variableId: 'channelName33', name: 'Channel 33 Name' },
		{ variableId: 'channelName34', name: 'Channel 34 Name' },
		{ variableId: 'channelName35', name: 'Channel 35 Name' },
		{ variableId: 'channelName36', name: 'Channel 36 Name' },
		{ variableId: 'channelName37', name: 'Channel 37 Name' },
		{ variableId: 'channelName38', name: 'Channel 38 Name' },
		{ variableId: 'channelName39', name: 'Channel 39 Name' },
		{ variableId: 'channelName40', name: 'Channel 40 Name' },
		{ variableId: 'channelName41', name: 'Channel 41 Name' },
		{ variableId: 'channelName42', name: 'Channel 42 Name' },
		{ variableId: 'channelName43', name: 'Channel 43 Name' },
		{ variableId: 'channelName44', name: 'Channel 44 Name' },
		{ variableId: 'channelName45', name: 'Channel 45 Name' },
		{ variableId: 'channelName46', name: 'Channel 46 Name' },
		{ variableId: 'channelName47', name: 'Channel 47 Name' },
		{ variableId: 'channelName48', name: 'Channel 48 Name' },
		{ variableId: 'channelName49', name: 'Channel 49 Name' },
		{ variableId: 'channelName50', name: 'Channel 50 Name' },
		{ variableId: 'channelName51', name: 'Channel 51 Name' },
		{ variableId: 'channelName52', name: 'Channel 52 Name' },
		{ variableId: 'channelName53', name: 'Channel 53 Name' },
		{ variableId: 'channelName54', name: 'Channel 54 Name' },
		{ variableId: 'channelName55', name: 'Channel 55 Name' },
		{ variableId: 'channelName56', name: 'Channel 56 Name' },
		{ variableId: 'channelName57', name: 'Channel 57 Name' },
		{ variableId: 'channelName58', name: 'Channel 58 Name' },
		{ variableId: 'channelName59', name: 'Channel 59 Name' },
		{ variableId: 'channelName60', name: 'Channel 60 Name' },
		{ variableId: 'channelName61', name: 'Channel 61 Name' },
		{ variableId: 'channelName62', name: 'Channel 62 Name' },
		{ variableId: 'channelName63', name: 'Channel 63 Name' },
		{ variableId: 'channelName64', name: 'Channel 64 Name' },
	])
}
