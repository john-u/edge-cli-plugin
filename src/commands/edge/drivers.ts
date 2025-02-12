import { Flags } from '@oclif/core'

import { outputListing, allOrganizationsFlags } from '@smartthings/cli-lib'
import { EdgeDriver } from '@smartthings/core-sdk'

import { EdgeCommand } from '../../lib/edge-command'
import { buildTableOutput, listDrivers, listTableFieldDefinitions } from '../../lib/commands/drivers-util'


export default class DriversCommand extends EdgeCommand {
	static description = `list all drivers owned by you or retrieve a single driver
Use this command to list all drivers you own, even if they are not yet assigned to a channel.

See also:
  edge:drivers:installed to list installed drivers
  edge:channels:drivers to list drivers that are part of a channel you own or have subscribed to
`

	static flags = {
		...EdgeCommand.flags,
		...outputListing.flags,
		...allOrganizationsFlags,
		version: Flags.string({
			char: 'V',
			description: 'driver version',
		}),
	}

	static args = [{
		name: 'idOrIndex',
		description: 'the driver id or number in list',
	}]

	static examples = [`# list all user-owned drivers
$ smartthings edge:drivers

# display details about the third driver listed in the above command
$ smartthings edge:drivers 3`,
	`
# display details about a driver by using its id
$ smartthings edge:drivers 699c7308-8c72-4363-9571-880d0f5cc725

# get information on a specific version of a driver
$ smartthings edge:drivers 699c7308-8c72-4363-9571-880d0f5cc725 --version 2021-10-25T00:48:23.295969`]

	async run(): Promise<void> {
		const { args, argv, flags } = await this.parse(DriversCommand)
		await super.setup(args, argv, flags)

		const config = {
			primaryKeyName: 'driverId',
			sortKeyName: 'name',
			buildTableOutput: (driver: EdgeDriver) => buildTableOutput(this.tableGenerator, driver),
			listTableFieldDefinitions,
		}

		if (flags['all-organizations']) {
			config.listTableFieldDefinitions.push('organization')
		}

		const getDriver = (id: string): Promise<EdgeDriver> =>
			flags.version ? this.client.drivers.getRevision(id, flags.version) : this.client.drivers.get(id)

		await outputListing(this, config, args.idOrIndex,
			() => listDrivers(this.client, flags['all-organizations']),
			getDriver)
	}
}
