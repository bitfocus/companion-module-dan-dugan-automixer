# companion-module-dan-dugan-automixer

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Version History

### Version 2.0.0

- Rewritten in TypeScript, on Companion module API 2.2. Needs Companion 5.1 or later
- Node 26
- Existing buttons are converted: custom values and Use Variable fields become expressions
- Each message waits for the unit's reply, or half a second, before the next is sent. A toggle or relative change
  queued behind another builds on the reply to it
- Binary replies (meters, bulk channel and matrix settings) are read whole when TCP splits them
- Fix: bulk channel settings read the bypass, NOM, music, override, group and preset flags from the reply
- Fix: the IP address, subnet mask and gateway variables
- Fix: the Master and DHCP variables
- Fix: matrix fader variables follow the bulk matrix query
- Fix: Group Last Hold feedbacks update
- Removed the hidden, never implemented UDP option
- Unit tests

## Version 1.1.3

- Use Node 22
- Update companion-module-base
- Update companion-module-tools

## Version 1.1.1

- Update companion-module-base
- Update companion-module-tools

### Version 1.1.0

- Action Recorder
- Update companion-module-tools

### Version 1.0.4

- Better status updates
- Update companion-module-base

### Version 1.0.3

- Update help
- Update companion-module-tools

### Version 1.0.1

- Add timeout clearToTx (500ms).
- Update help
- Code refactor
- Update companion-module-base & companion-module-tools

### Version 1.0.0

- Initial release
