import { Flags } from '@oclif/core'

import { chooseChannel } from '../../../lib/commands/channels-util'
import { chooseHub } from '../../../lib/commands/drivers-util'
import { EdgeCommand } from '../../../lib/edge-command'


export class ChannelsEnrollCommand extends EdgeCommand {
	static description = 'enroll a hub in a channel'

	static flags = {
		...EdgeCommand.flags,
		'channel': Flags.string({
			char: 'C',
			description: 'channel id',
		}),
	}

	static args = [
		{
			name: 'hubId',
			description: 'hub id',
		},
	]

	async run(): Promise<void> {
		const { args, argv, flags } = await this.parse(ChannelsEnrollCommand)
		await super.setup(args, argv, flags)

		const channelId = await chooseChannel(this, 'Select a channel.', flags.channel,
			{ includeReadOnly: true })
		const hubId = await chooseHub(this, 'Select a hub.', args.hubId, { useConfigDefault: true })

		await this.client.channels.enrollHub(channelId, hubId)

		this.log(`${hubId} enrolled in channel ${channelId}`)
	}
}
