import { Container, Stack, Tabs } from '@mantine/core';
import { BluetoothInterface } from '../components';

function Settings() {
	return (

		<Tabs defaultValue="bluetooth">
			<Tabs.List>
				<Tabs.Tab value="bluetooth">
					Bluetooth
				</Tabs.Tab>
				<Tabs.Tab value="appearance">
					Appearance
				</Tabs.Tab>
			</Tabs.List>
			<Container size="xl" py="xl">
				<Stack gap="xl">
					<Tabs.Panel value="bluetooth">
						{/* Bluetooth Speaker Configuration */}
						<BluetoothInterface />
					</Tabs.Panel>
					<Tabs.Panel value="appearance">
						Appearance
					</Tabs.Panel>
				</Stack>
			</Container>
		</Tabs>

	);
}

export default Settings;
