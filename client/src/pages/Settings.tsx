import { Container, Stack, Tabs } from '@mantine/core';
import { BluetoothInterface } from '../components';

function Settings() {
	return (
		<Tabs defaultValue="bluetooth">
			<Container size="sm">
				<Tabs.List>
					<Tabs.Tab value="bluetooth">
						Bluetooth
					</Tabs.Tab>
					<Tabs.Tab value="appearance">
						Appearance
					</Tabs.Tab>
				</Tabs.List>
				<div
					style={{
						position: "absolute",
						left: "0",
						marginTop: "-1px",
						zIndex: "-1",
						height: "1px",
						width: "100vw",
						backgroundColor: "var(--tab-border-color)"
					}}
				>
					&nbsp;
				</div>
			</Container>
			<Container size="sm" py="md">
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
