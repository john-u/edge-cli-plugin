import { Device, DeviceIntegrationType, DriverChannelDetails, EdgeDriver, EdgeDriverSummary,
	SmartThingsClient } from '@smartthings/core-sdk'

import { APICommand, ChooseOptions, chooseOptionsWithDefaults, forAllOrganizations, selectFromList,
	stringTranslateToId, summarizedText, TableGenerator } from '@smartthings/cli-lib'


export const listTableFieldDefinitions = ['driverId', 'name', 'version', 'packageKey']

export const permissionsValue = (driver: EdgeDriver): string => driver.permissions?.map(permission => permission.name).join('\n') || 'none'
export const buildTableOutput = (tableGenerator: TableGenerator, driver: EdgeDriver): string => {
	const basicInfo = tableGenerator.buildTableFromItem(driver, [
		'driverId', 'name', 'version', 'packageKey', 'description',
		{ label: 'Permissions', value: permissionsValue },
	])

	const deviceIntegrationProfiles = 'Device Integration Profiles\n' +
		tableGenerator.buildTableFromList(driver.deviceIntegrationProfiles,
			['id', 'majorVersion'])
	let fingerprints = 'No fingerprints specified.'
	if (driver.fingerprints?.length) {
		fingerprints = 'Fingerprints\n' +
			tableGenerator.buildTableFromList(driver.fingerprints, ['id', 'type', 'deviceLabel'])
	}
	return `Basic Information\n${basicInfo}\n\n` +
		`${deviceIntegrationProfiles}\n\n` +
		`${fingerprints}\n\n` +
		summarizedText
}

export const listDrivers = async (client: SmartThingsClient, includeAllOrganizations?: boolean): Promise<EdgeDriver[]> =>
	includeAllOrganizations
		? forAllOrganizations(client, orgClient => orgClient.drivers.list())
		: client.drivers.list()


export async function chooseDriver(command: APICommand, promptMessage: string, commandLineDriverId?: string,
		options?: Partial<ChooseOptions>): Promise<string> {
	const opts = chooseOptionsWithDefaults(options)
	const config = {
		itemName: 'driver',
		primaryKeyName: 'driverId',
		sortKeyName: 'name',
	}
	const listItems = (): Promise<EdgeDriverSummary[]> => command.client.drivers.list()
	const preselectedId = opts.allowIndex
		? await stringTranslateToId(config, commandLineDriverId, listItems)
		: commandLineDriverId
	return selectFromList(command, config, { preselectedId, listItems, promptMessage })
}

export const chooseHub = async (command: APICommand, promptMessage: string,
		commandLineHubId: string | undefined,
		options?: Partial<ChooseOptions>): Promise<string> => {
	const opts = chooseOptionsWithDefaults(options)
	const config = {
		itemName: 'hub',
		primaryKeyName: 'deviceId',
		sortKeyName: 'name',
		listTableFieldDefinitions: ['label', 'name', 'deviceId'],
	}

	const listItems = async (): Promise<Device[]> => {
		const hubs = await command.client.devices.list({ type: DeviceIntegrationType.HUB })
		const locationIds = new Set<string>()
		hubs.forEach(hub => {
			if (hub.locationId !== undefined) {
				locationIds.add(hub.locationId)
			} else {
				command.logger.warn('hub record found without locationId', hub)
			}
		})

		// remove shared locations
		for (const locationId of locationIds) {
			const location = await command.client.locations.get(locationId, { allowed: true })

			if (!location.allowed?.includes('d:locations')) {
				command.logger.warn('filtering out location', location)
				locationIds.delete(location.locationId)
			}
		}

		const ownHubs = hubs.filter(hub => hub.locationId && locationIds.has(hub.locationId))

		return ownHubs
	}

	const preselectedId = commandLineHubId
		? (opts.allowIndex
			? await stringTranslateToId(config, commandLineHubId, listItems)
			: commandLineHubId)
		: undefined

	const configKeyForDefaultValue = opts.useConfigDefault ? 'defaultHub' : undefined
	return selectFromList(command, config,
		{ preselectedId, listItems, promptMessage, configKeyForDefaultValue })
}

export interface DriverChannelDetailsWithName extends DriverChannelDetails {
	name: string
}

export const listAssignedDriversWithNames = async (client: SmartThingsClient, channelId: string): Promise<DriverChannelDetailsWithName[]> => {
	const drivers = await client.channels.listAssignedDrivers(channelId)
	return (await Promise.all(
		drivers.map(async driver => {
			try {
				const driverInfo = await client.channels.getDriverChannelMetaInfo(channelId, driver.driverId)
				return {
					...driver,
					name: driverInfo.name,
				}
			} catch (error) {
				// There is currently a bug in the API that causes `listAssignedDrivers`
				// to return drivers that were deleted but not removed from the channel.
				// We can tell they have been deleted because we get a 404 on the call
				// to `getRevision`, so we'll just skip them until the API is fixed.
				if (error.response?.status === 404) {
					return undefined
				}
				throw error
			}
		}))).filter((driver): driver is DriverChannelDetailsWithName => !!driver)
}

export const chooseDriverFromChannel = async (command: APICommand, channelId: string,
		preselectedId?: string): Promise<string> => {
	const config = {
		itemName: 'driver',
		primaryKeyName: 'driverId',
		sortKeyName: 'name',
	}
	const listItems = (): Promise<DriverChannelDetailsWithName[]> => listAssignedDriversWithNames(command.client, channelId)
	return selectFromList(command, config,
		{ preselectedId, listItems, promptMessage: 'Select a driver to install.' })
}
