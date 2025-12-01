import { Container, Stack, Tabs, ScrollArea } from '@mantine/core';
import { BluetoothInterface } from '../components';

function Settings() {
	return (
		<Tabs
			defaultValue="bluetooth"
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'var(--main-content-height)'
			}}
		>
			<Container size="sm" style={{ width: '100%' }}>
				<Tabs.List justify='flex-start'>
					<Tabs.Tab size="xl" value="bluetooth">
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

			<ScrollArea
				style={{ flex: 1 }}
				scrollbars="y"
				scrollbarSize={4}
			>
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
			</ScrollArea>
		</Tabs>
	);
}

export default Settings;
