import { Container, Stack, Title, Divider } from '@mantine/core';
import { BluetoothInterface } from '../components';

function Settings() {
	return (
		<Container size="xl" py="xl">
			<Stack gap="xl">
				<Title order={1}>Settings</Title>

				<Divider />

				{/* Bluetooth Speaker Configuration */}
				<BluetoothInterface />

				<Divider />

				{/* Additional settings will go here */}
			</Stack>
		</Container>
	);
}

export default Settings;
