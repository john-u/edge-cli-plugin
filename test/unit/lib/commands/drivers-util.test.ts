import { Device, DeviceIntegrationType, DriverChannelDetails, EdgeDeviceIntegrationProfileKey,
	EdgeDriver, EdgeDriverPermissions, EdgeDriverSummary, Location, OrganizationResponse, SmartThingsClient }
	from '@smartthings/core-sdk'

import { APICommand, ChooseOptions, chooseOptionsWithDefaults, forAllOrganizations, selectFromList,
	stringTranslateToId, TableGenerator, WithOrganization } from '@smartthings/cli-lib'

import { buildTableOutput, chooseDriver, chooseDriverFromChannel, chooseHub,
	DriverChannelDetailsWithName, listAssignedDriversWithNames, listDrivers, permissionsValue }
	from '../../../../src/lib/commands/drivers-util'
import * as driversUtil from '../../../../src/lib/commands/drivers-util'
import { EdgeClient } from '../../../../src/lib/edge-client'
import { EdgeCommand } from '../../../../src/lib/edge-command'


jest.mock('@smartthings/cli-lib', () => ({
	chooseOptionsWithDefaults: jest.fn(),
	stringTranslateToId: jest.fn(),
	selectFromList: jest.fn(),
	forAllOrganizations: jest.fn(),
	summarizedText: 'summarized text',
}))

describe('drivers-util', () => {
	const selectFromListMock = jest.mocked(selectFromList)

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('permissionsValue', () => {
		it('returns none with no permissions at all', () => {
			expect(permissionsValue({} as EdgeDriver)).toBe('none')
		})

		it('returns none with empty permissions array', () => {
			expect(permissionsValue({ permissions: [] as EdgeDriverPermissions[] } as EdgeDriver)).toBe('none')
		})

		it('combines permissions names', () => {
			expect(permissionsValue({ permissions: [
				{ name: 'r:locations' },
				{ name: 'r:devices' },
			] } as EdgeDriver)).toBe('r:locations\nr:devices')
		})
	})

	describe('buildTableOutput', () => {
		const buildTableFromItem = jest.fn().mockReturnValue('basic info')
		const buildTableFromList = jest.fn()
		const tableGenerator = {
			buildTableFromItem,
			buildTableFromList,
		} as unknown as TableGenerator
		const minimalDriver: EdgeDriver = {
			driverId: 'driver-id',
			name: 'Driver Name',
			version: 'driver-version',
			packageKey: 'package key',
			deviceIntegrationProfiles: [{ id: 'profile-id' } as EdgeDeviceIntegrationProfileKey],
		}

		it('works with minimal fields', () => {
			buildTableFromList.mockReturnValueOnce('profiles table')

			expect(buildTableOutput(tableGenerator, minimalDriver))
				.toBe('Basic Information\nbasic info\n\n' +
					'Device Integration Profiles\nprofiles table\n\n' +
					'No fingerprints specified.\n\n' +
					'summarized text')

			expect(buildTableFromItem).toHaveBeenCalledTimes(1)
			expect(buildTableFromItem).toHaveBeenCalledWith(minimalDriver,
				expect.arrayContaining(['driverId', 'name', 'version', 'packageKey']))
			expect(buildTableFromList).toHaveBeenCalledTimes(1)
			expect(buildTableFromList).toHaveBeenCalledWith(minimalDriver.deviceIntegrationProfiles,
				['id', 'majorVersion'])
		})

		it('includes fingerprints when specified', () => {
			const driver = { ...minimalDriver, fingerprints: [{ id: 'fingerprint-id' }] } as EdgeDriver
			buildTableFromList.mockReturnValueOnce('profiles table')
			buildTableFromList.mockReturnValueOnce('fingerprints table')

			expect(buildTableOutput(tableGenerator, driver))
				.toBe('Basic Information\nbasic info\n\n' +
					'Device Integration Profiles\nprofiles table\n\n' +
					'Fingerprints\nfingerprints table\n\n' +
					'summarized text')

			expect(buildTableFromItem).toHaveBeenCalledTimes(1)
			expect(buildTableFromItem).toHaveBeenCalledWith(driver,
				expect.arrayContaining(['driverId', 'name', 'version', 'packageKey']))
			expect(buildTableFromList).toHaveBeenCalledTimes(2)
			expect(buildTableFromList).toHaveBeenCalledWith(driver.deviceIntegrationProfiles,
				['id', 'majorVersion'])
			expect(buildTableFromList).toHaveBeenCalledWith(driver.fingerprints,
				['id', 'type', 'deviceLabel'])
		})
	})

	const apiListDriversMock = jest.fn()
	const client = { drivers: { list: apiListDriversMock } } as unknown as SmartThingsClient
	const driverList = [{ name: 'Driver' }] as EdgeDriverSummary[]

	describe('listDrivers', () => {
		const forAllOrganizationsMock = jest.mocked(forAllOrganizations)

		it('normally uses drivers.list', async () => {
			apiListDriversMock.mockResolvedValueOnce(driverList)

			expect(await listDrivers(client)).toBe(driverList)

			expect(apiListDriversMock).toHaveBeenCalledTimes(1)
			expect(apiListDriversMock).toHaveBeenCalledWith()
			expect(forAllOrganizationsMock).toHaveBeenCalledTimes(0)
		})

		it('lists drivers for all organizations when requested', async () => {
			const withOrg = [{ name: 'driver', organization: 'organization-name' }] as (EdgeDriverSummary & WithOrganization)[]
			forAllOrganizationsMock.mockResolvedValueOnce(withOrg)

			expect(await listDrivers(client, true)).toBe(withOrg)

			expect(apiListDriversMock).toHaveBeenCalledTimes(0)
			expect(forAllOrganizationsMock).toHaveBeenCalledTimes(1)
			expect(forAllOrganizationsMock).toHaveBeenCalledWith(client, expect.any(Function))

			const listDriversFunction = forAllOrganizationsMock.mock.calls[0][1]
			apiListDriversMock.mockResolvedValueOnce(driverList)

			expect(await listDriversFunction(client, { organizationId: 'unused' } as OrganizationResponse)).toBe(driverList)
			expect(apiListDriversMock).toHaveBeenCalledTimes(1)
			expect(apiListDriversMock).toHaveBeenCalledWith()
		})
	})

	describe('chooseDriver', () => {
		const command = { client } as unknown as EdgeCommand

		const chooseOptionsWithDefaultsMock = jest.mocked(chooseOptionsWithDefaults)
		const stringTranslateToIdMock = jest.mocked(stringTranslateToId)

		it('presents user with list of drivers', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-driver-id')

			expect(await chooseDriver(command, 'prompt message', 'command-line-driver-id')).toBe('chosen-driver-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledWith(undefined)
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(0)
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'driverId', sortKeyName: 'name' }),
				expect.objectContaining({ preselectedId: 'command-line-driver-id', promptMessage: 'prompt message' }))
		})

		it('translates id from index if allowed', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: true } as ChooseOptions)
			stringTranslateToIdMock.mockResolvedValueOnce('translated-id')
			selectFromListMock.mockImplementation(async () => 'chosen-driver-id')

			expect(await chooseDriver(command, 'prompt message', 'command-line-driver-id',
				{ allowIndex: true })).toBe('chosen-driver-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledWith({ allowIndex: true })
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(1)
			expect(stringTranslateToIdMock).toHaveBeenCalledWith(
				expect.objectContaining({ primaryKeyName: 'driverId', sortKeyName: 'name' }),
				'command-line-driver-id', expect.any(Function))
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'driverId', sortKeyName: 'name' }),
				expect.objectContaining({ preselectedId: 'translated-id', promptMessage: 'prompt message' }))
		})

		it('uses list function that lists drivers', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-driver-id')

			expect(await chooseDriver(command, 'prompt message', 'command-line-driver-id'))
				.toBe('chosen-driver-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledWith(undefined)
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(0)
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'driverId', sortKeyName: 'name' }),
				expect.objectContaining({ preselectedId: 'command-line-driver-id', promptMessage: 'prompt message' }))

			const listItems = selectFromListMock.mock.calls[0][2].listItems

			apiListDriversMock.mockResolvedValueOnce(driverList)

			expect(await listItems()).toBe(driverList)

			expect(apiListDriversMock).toHaveBeenCalledTimes(1)
			expect(apiListDriversMock).toHaveBeenCalledWith()
		})
	})

	describe('chooseHub', () => {
		const listDevicesMock = jest.fn()
		const getLocationsMock = jest.fn()
		const client = { devices: { list: listDevicesMock }, locations: { get: getLocationsMock } }
		const command = { client, logger: { warn: jest.fn() } } as unknown as APICommand

		const chooseOptionsWithDefaultsMock = jest.mocked(chooseOptionsWithDefaults)
		const stringTranslateToIdMock = jest.mocked(stringTranslateToId)

		it('uses default hub if specified', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false, useConfigDefault: true } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', undefined,
				{ useConfigDefault: true })).toBe('chosen-hub-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledWith({ useConfigDefault: true })
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(0)
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'deviceId', sortKeyName: 'name' }),
				expect.objectContaining({ configKeyForDefaultValue: 'defaultHub', promptMessage: 'prompt message' }))
		})

		it('prefers command line over default', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false, useConfigDefault: true } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', 'command-line-hub-id',
				{ useConfigDefault: true })).toBe('chosen-hub-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledWith({ useConfigDefault: true })
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(0)
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'deviceId', sortKeyName: 'name' }),
				expect.objectContaining({
					preselectedId: 'command-line-hub-id',
					configKeyForDefaultValue: 'defaultHub',
					promptMessage: 'prompt message',
				}))
		})

		it('translates id from index if allowed', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: true } as ChooseOptions)
			stringTranslateToIdMock.mockResolvedValueOnce('translated-id')
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', 'command-line-hub-id',
				{ useConfigDefault: true, allowIndex: true })).toBe('chosen-hub-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock)
				.toHaveBeenCalledWith({ allowIndex: true, useConfigDefault: true })
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(1)
			expect(stringTranslateToIdMock).toHaveBeenCalledWith(
				expect.objectContaining({ primaryKeyName: 'deviceId', sortKeyName: 'name' }),
				'command-line-hub-id', expect.any(Function))
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'deviceId', sortKeyName: 'name' }),
				expect.objectContaining({ preselectedId: 'translated-id', promptMessage: 'prompt message' }))
		})

		it('uses list function that specifies hubs', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', 'command-line-hub-id')).toBe('chosen-hub-id')

			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledTimes(1)
			expect(chooseOptionsWithDefaultsMock).toHaveBeenCalledWith(undefined)
			expect(stringTranslateToIdMock).toHaveBeenCalledTimes(0)
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'deviceId', sortKeyName: 'name' }),
				expect.objectContaining({ preselectedId: 'command-line-hub-id', promptMessage: 'prompt message' }))

			const listItems = selectFromListMock.mock.calls[0][2].listItems

			const list = [{ name: 'Hub', locationId: 'locationId' }] as Device[]
			listDevicesMock.mockResolvedValueOnce(list)
			getLocationsMock.mockResolvedValueOnce({
				'allowed': [
					'd:locations',
				],
				'locationId': 'locationId',
			})

			expect(await listItems()).toStrictEqual(list)

			expect(listDevicesMock).toHaveBeenCalledTimes(1)
			expect(listDevicesMock).toHaveBeenCalledWith({ type: DeviceIntegrationType.HUB })
		})

		test('list function checks hub locations for ownership', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', 'command-line-hub-id')).toBe('chosen-hub-id')

			const hubList = [
				{ name: 'Hub', locationId: 'locationId' },
				{ name: 'AnotherHub', locationId: 'locationId' },
				{ name: 'SecondLocationHub', locationId: 'secondLocationId' },
			] as Device[]

			const location = {
				'allowed': [
					'd:locations',
				],
			} as Location

			listDevicesMock.mockResolvedValueOnce(hubList)
			getLocationsMock.mockResolvedValue(location)

			const listItems = selectFromListMock.mock.calls[0][2].listItems

			expect(await listItems()).toStrictEqual(hubList)

			expect(getLocationsMock).toBeCalledTimes(2)
			expect(getLocationsMock).toBeCalledWith('locationId', { allowed: true })
			expect(getLocationsMock).toBeCalledWith('secondLocationId', { allowed: true })
		})

		test('list function filters out devices on shared locations or when allowed is null, undefined', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', 'command-line-hub-id')).toBe('chosen-hub-id')

			const ownedHub = { name: 'Hub', locationId: 'locationId' }
			const hubList = [
				ownedHub,
				{ name: 'SharedHub', locationId: 'sharedLocationId' },
				{ name: 'NullAllowedHub', locationId: 'nullAllowedLocationId' },
				{ name: 'UndefinedAllowedHub', locationId: 'undefinedAllowedLocationId' },
			] as Device[]

			listDevicesMock.mockResolvedValueOnce(hubList)

			const location = {
				'allowed': [
					'd:locations',
				],
				'locationId': 'locationId',
			}

			const sharedLocation = {
				'allowed': [
				],
				'locationId': 'sharedLocationId',
			}

			const nullAllowedLocation = {
				'allowed': null,
				'locationId': 'nullAllowedLocationId',
			}

			const undefinedAllowedLocation = {
				'locationId': 'undefinedAllowedLocationId',
			}

			getLocationsMock
				.mockResolvedValueOnce(location)
				.mockResolvedValueOnce(sharedLocation)
				.mockResolvedValueOnce(nullAllowedLocation)
				.mockResolvedValueOnce(undefinedAllowedLocation)

			const listItems = selectFromListMock.mock.calls[0][2].listItems

			expect(await listItems()).toStrictEqual([ownedHub])

			expect(getLocationsMock).toBeCalledTimes(4)
			expect(command.logger.warn).toBeCalledWith('filtering out location', sharedLocation)
			expect(command.logger.warn).toBeCalledWith('filtering out location', nullAllowedLocation)
			expect(command.logger.warn).toBeCalledWith('filtering out location', undefinedAllowedLocation)
		})

		test('list function warns when hub does not have locationId', async () => {
			chooseOptionsWithDefaultsMock.mockReturnValueOnce({ allowIndex: false } as ChooseOptions)
			selectFromListMock.mockImplementation(async () => 'chosen-hub-id')

			expect(await chooseHub(command, 'prompt message', 'command-line-hub-id')).toBe('chosen-hub-id')

			const hub = { name: 'Hub' } as Device

			listDevicesMock.mockResolvedValueOnce([hub])

			const listItems = selectFromListMock.mock.calls[0][2].listItems

			expect(await listItems()).toStrictEqual([])

			expect(command.logger.warn).toBeCalledWith('hub record found without locationId', hub)
		})
	})

	describe('listAssignedDriversWithNames', () => {
		const driverChannelDetailsList = [{ channelId: 'channel-id', driverId: 'driver-id' }] as
			unknown as DriverChannelDetails[]
		const listAssignedDriversMock = jest.fn()
		const getDriverChannelMetaInfoMock = jest.fn()
		const client = { channels: {
			listAssignedDrivers: listAssignedDriversMock,
			getDriverChannelMetaInfo: getDriverChannelMetaInfoMock,
		} } as unknown as SmartThingsClient

		it('lists drivers with their names', async () => {
			listAssignedDriversMock.mockReturnValueOnce(driverChannelDetailsList)
			getDriverChannelMetaInfoMock.mockResolvedValueOnce({ name: 'driver name' })

			const result = await listAssignedDriversWithNames(client, 'channel-id')

			expect(result).toEqual([{ channelId: 'channel-id', driverId: 'driver-id', name: 'driver name' }])

			expect(listAssignedDriversMock).toHaveBeenCalledTimes(1)
			expect(listAssignedDriversMock).toHaveBeenCalledWith('channel-id')
			expect(getDriverChannelMetaInfoMock).toHaveBeenCalledTimes(1)
			expect(getDriverChannelMetaInfoMock).toHaveBeenCalledWith('channel-id', 'driver-id')
		})

		it('skips deleted drivers', async () => {
			const driverChannelDetailsList = [
				{ channelId: 'channel-id', driverId: 'driver-id' },
				{ channelId: 'channel-id', driverId: 'deleted-driver-id' },
			] as unknown as DriverChannelDetails[]
			listAssignedDriversMock.mockReturnValueOnce(driverChannelDetailsList)
			getDriverChannelMetaInfoMock.mockResolvedValueOnce({ name: 'driver name' })
			getDriverChannelMetaInfoMock.mockRejectedValueOnce({ response: { status: 404 } })

			const result = await listAssignedDriversWithNames(client, 'channel-id')

			expect(result).toEqual([{ channelId: 'channel-id', driverId: 'driver-id', name: 'driver name' }])

			expect(listAssignedDriversMock).toHaveBeenCalledTimes(1)
			expect(listAssignedDriversMock).toHaveBeenCalledWith('channel-id')
			expect(getDriverChannelMetaInfoMock).toHaveBeenCalledTimes(2)
			expect(getDriverChannelMetaInfoMock).toHaveBeenCalledWith('channel-id', 'driver-id')
			expect(getDriverChannelMetaInfoMock).toHaveBeenCalledWith('channel-id', 'deleted-driver-id')
		})

		it('passes on other errors from getDriverChannelMetaInfo', async () => {
			listAssignedDriversMock.mockReturnValueOnce(driverChannelDetailsList)
			getDriverChannelMetaInfoMock.mockRejectedValueOnce(Error('random error'))

			expect(listAssignedDriversWithNames(client, 'channel-id')).rejects.toThrow(Error('random error'))

			expect(listAssignedDriversMock).toHaveBeenCalledTimes(1)
			expect(listAssignedDriversMock).toHaveBeenCalledWith('channel-id')
		})
	})

	describe('chooseDriverFromChannel', () => {
		it('presents user with list of drivers with names', async () => {
			const client = {} as EdgeClient
			const command = { client } as unknown as EdgeCommand
			selectFromListMock.mockResolvedValueOnce('chosen-driver-id')

			const result = await chooseDriverFromChannel(command, 'channel-id', 'preselected-driver-id')

			expect(result).toBe('chosen-driver-id')
			expect(selectFromListMock).toHaveBeenCalledTimes(1)
			expect(selectFromListMock).toHaveBeenCalledWith(command,
				expect.objectContaining({ primaryKeyName: 'driverId', sortKeyName: 'name' }),
				expect.objectContaining({
					preselectedId: 'preselected-driver-id',
					promptMessage: 'Select a driver to install.',
				}))

			const drivers = [{ name: 'driver' }] as DriverChannelDetailsWithName[]
			const listAssignedDriversWithNamesSpy = jest.spyOn(driversUtil, 'listAssignedDriversWithNames')
				.mockResolvedValueOnce(drivers)

			const listItems = selectFromListMock.mock.calls[0][2].listItems

			expect(await listItems()).toBe(drivers)

			expect(listAssignedDriversWithNamesSpy).toHaveBeenCalledTimes(1)
			expect(listAssignedDriversWithNamesSpy).toHaveBeenCalledWith(client, 'channel-id')
		})
	})
})
