import { Flags } from '@oclif/core'

import { SubscriberType } from '@smartthings/core-sdk'

import { outputListing, allOrganizationsFlags } from '@smartthings/cli-lib'
import { EdgeCommand } from '../../lib/edge-command'
import { listChannels, listTableFieldDefinitions, tableFieldDefinitions } from '../../lib/commands/channels-util'


export default class ChannelsCommand extends EdgeCommand {
	static description = 'list all channels owned by you or retrieve a single channel'

	/* eslint-disable @typescript-eslint/naming-convention */
	static flags = {
		...EdgeCommand.flags,
		...outputListing.flags,
		...allOrganizationsFlags,
		'include-read-only': Flags.boolean({
			char: 'I',
			description: 'include subscribed-to channels as well as owned channels',
			exclusive: ['all-organizations'],
		}),
		'subscriber-type': Flags.string({
			description: 'filter results based on subscriber type',
			options: ['HUB'],
		}),
		'subscriber-id': Flags.string({
			description: 'filter results based on subscriber id (e.g. hub id)',
			dependsOn: ['subscriber-type'],
		}),
	}
	/* eslint-enable @typescript-eslint/naming-convention */

	static args = [{
		name: 'idOrIndex',
		description: 'the channel id or number in list',
	}]

	static examples = [`# list all user-owned channels
$ smartthings edge:channels

# list user-owned and subscribed channels
$ smartthings edge:channels --include-read-only`,
	`
# display details about the second channel listed when running "smartthings edge:channels"
$ smartthings edge:channels 2

# display channels subscribed to by the specified hub
$ smartthings edge:channels --subscriber-type HUB --subscriber-id <hub-id>`]

	async run(): Promise<void> {
		const { args, argv, flags } = await this.parse(ChannelsCommand)
		await super.setup(args, argv, flags)

		const config = {
			primaryKeyName: 'channelId',
			sortKeyName: 'name',
			listTableFieldDefinitions,
			tableFieldDefinitions,
		}
		if (flags['all-organizations']) {
			config.listTableFieldDefinitions.push('organization')
		}

		await outputListing(this, config, args.idOrIndex,
			async () => listChannels(this.client, {
				subscriberType: flags['subscriber-type'] as SubscriberType | undefined,
				subscriberId: flags['subscriber-id'],
				includeReadOnly: flags['include-read-only'],
			}),
			id => this.client.channels.get(id))
	}
}
