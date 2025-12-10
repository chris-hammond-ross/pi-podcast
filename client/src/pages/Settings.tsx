import { useState } from 'react';
import {
	Box,
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Button,
	LoadingOverlay
} from '@mantine/core';
import {
	RefreshCw
} from 'lucide-react';
import { BluetoothInterface } from '../components';
import { restartServices } from '../services';

const RESTART_OVERLAY_DURATION = 10000; // 10 seconds

function Settings() {
	const [isRestarting, setIsRestarting] = useState(false);

	const handleRestartService = async () => {
		setIsRestarting(true);

		try {
			await restartServices();
		} catch (error) {
			console.error('Failed to restart services:', error);
		}

		// Keep overlay visible for set duration regardless of API response
		// (the API connection may drop during restart)
		setTimeout(() => {
			setIsRestarting(false);
		}, RESTART_OVERLAY_DURATION);
	};

	return (
		<Box pos="relative" style={{ height: 'var(--main-content-height)' }}>
			<LoadingOverlay
				visible={isRestarting}
				zIndex={1000}
				overlayProps={{ radius: 'sm', blur: 2 }}
				loaderProps={{ type: 'bars' }}
			/>
			<Tabs
				defaultValue="bluetooth"
				style={{
					display: 'flex',
					flexDirection: 'column',
					height: '100%'
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
						<Tabs.Tab value="system">
							System
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
							<Tabs.Panel value="system">
								<Button
									fullWidth
									variant='light'
									color='pink'
									leftSection={<RefreshCw size={16} />}
									onClick={handleRestartService}
									loading={isRestarting}
								>
									Reset Service
								</Button>
							</Tabs.Panel>
						</Stack>
					</Container>
				</ScrollArea>
			</Tabs>
		</Box>
	);
}

export default Settings;
