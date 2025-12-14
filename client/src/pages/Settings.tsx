import { useState, useEffect } from 'react';
import {
	Box,
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Button,
	LoadingOverlay,
	Card,
	Text,
	Group,
	Progress,
	Skeleton
} from '@mantine/core';
import {
	RefreshCw
} from 'lucide-react';
import { BluetoothInterface } from '../components';
import { restartServices, getWebSocketService, type SystemStats } from '../services';

const RESTART_OVERLAY_DURATION = 10000; // 10 seconds

function Settings() {
	const [isRestarting, setIsRestarting] = useState(false);
	const [systemStats, setSystemStats] = useState<SystemStats | null>(null);

	useEffect(() => {
		const ws = getWebSocketService();

		const unsubscribe = ws.on((message) => {
			if (message.type === 'system:stats') {
				setSystemStats({
					os: message.os!,
					timestamp: message.timestamp!,
					cpu: message.cpu!,
					memory: message.memory!,
					disk: message.disk!,
					temperature: message.temperature ?? null,
					uptime: message.uptime!
				});
			}
		});

		// Request initial stats
		ws.send({ type: 'request-system-stats' });

		return () => {
			unsubscribe();
		};
	}, []);

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

	const formatValue = (value: number | null | undefined, unit: string, decimals: number = 1): string => {
		if (value === null || value === undefined) return '—';
		return `${value.toFixed(decimals)} ${unit}`;
	};

	return (
		<Box pos="relative" style={{ height: 'var(--main-content-height)' }}>
			<LoadingOverlay
				visible={isRestarting}
				zIndex={1000}
				overlayProps={{ radius: 'sm', blur: 2 }}
				loaderProps={{ type: 'dots' }}
				h="100svh"
				mt="calc(0px - var(--header-height))"
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
								<Stack gap="md">
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

									{!systemStats ? (
										<Stack gap="2px">
											<Card py="xs">
												<Skeleton height={16} width="30%" mb="sm" />
												<Stack gap="0.4rem">
													<Skeleton height={14} />
													<Skeleton height={14} />
												</Stack>
											</Card>
											<Card py="xs">
												<Skeleton height={16} width="20%" mb="sm" />
												<Stack gap="0.4rem">
													<Skeleton height={14} />
													<Skeleton height={14} />
													<Skeleton height={14} />
												</Stack>
											</Card>
											<Card py="xs">
												<Skeleton height={16} width="40%" mb="sm" />
												<Stack gap="0.4rem">
													<Skeleton height={14} />
													<Skeleton height={8} />
												</Stack>
											</Card>
											<Card py="xs">
												<Skeleton height={16} width="35%" mb="sm" />
												<Stack gap="0.4rem">
													<Skeleton height={14} />
													<Skeleton height={8} />
												</Stack>
											</Card>
										</Stack>
									) : (
										<Stack gap="2px">
											<Card py="xs">
												<Text pb="sm" size='sm'>System</Text>
												<Stack gap="0.4rem">
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Uptime</Text>
														<Text size='sm'>{systemStats.uptime}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>OS</Text>
														<Text size='sm'>{systemStats.os}</Text>
													</Group>
												</Stack>
											</Card>
											<Card py="xs">
												<Text pb="sm" size='sm'>CPU</Text>
												<Stack gap="0.4rem">
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Cores</Text>
														<Text size='sm'>{systemStats.cpu.cores}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Frequency</Text>
														<Text size='sm'>{formatValue(systemStats.cpu.frequency, 'GHz', 2)}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>SoC Temp</Text>
														<Text size='sm'>{formatValue(systemStats.temperature, '°C')}</Text>
													</Group>
												</Stack>
											</Card>
											<Card py="xs">
												<Group justify='space-between' pb="sm">
													<Text size='sm'>Memory Usage</Text>
													<Text size='sm' c="dimmed">{systemStats.memory.usage_percentage}%</Text>
												</Group>
												<Stack gap="0.4rem">
													<Progress
														value={systemStats.memory.usage_percentage}
														size="sm"
														color={systemStats.memory.usage_percentage > 80 ? 'red' : systemStats.memory.usage_percentage > 60 ? 'yellow' : 'blue'}
													/>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Used</Text>
														<Text size='sm'>{formatValue(systemStats.memory.used, 'GB')}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Free</Text>
														<Text size='sm'>{formatValue(systemStats.memory.free, 'GB')}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Total</Text>
														<Text size='sm'>{formatValue(systemStats.memory.total, 'GB')}</Text>
													</Group>
												</Stack>
											</Card>
											<Card py="xs">
												<Group justify='space-between' pb="sm">
													<Text size='sm'>Disk Usage</Text>
													<Text size='sm' c="dimmed">{systemStats.disk.usage_percentage ?? '—'}%</Text>
												</Group>
												<Stack gap="0.4rem">
													<Progress
														value={systemStats.disk.usage_percentage ?? 0}
														size="sm"
														color={
															systemStats.disk.usage_percentage
																? systemStats.disk.usage_percentage > 80
																	? 'red'
																	: systemStats.disk.usage_percentage > 60
																		? 'yellow'
																		: 'blue'
																: 'gray'
														}
													/>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Used</Text>
														<Text size='sm'>{formatValue(systemStats.disk.used, 'GB')}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Free</Text>
														<Text size='sm'>{formatValue(systemStats.disk.free, 'GB')}</Text>
													</Group>
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Total</Text>
														<Text size='sm'>{formatValue(systemStats.disk.total, 'GB')}</Text>
													</Group>
												</Stack>
											</Card>
										</Stack>
									)}
								</Stack>

							</Tabs.Panel>
						</Stack>
					</Container>
				</ScrollArea>
			</Tabs>
		</Box>
	);
}

export default Settings;
