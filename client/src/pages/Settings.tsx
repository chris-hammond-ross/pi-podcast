import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
	Box,
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Button,
	Overlay,
	LoadingOverlay,
	Card,
	Text,
	Group,
	Progress,
	Skeleton,
	useMantineColorScheme,
	Center,
	SegmentedControl
} from '@mantine/core';
import { RefreshCw, Sun, Moon, Power, Bot } from 'lucide-react';
import { BluetoothInterface } from '../components';
import { restartServices, rebootSystem, getWebSocketService, type SystemStats } from '../services';

const RESTART_OVERLAY_DURATION = 10000; // 10 seconds for service restart
const REBOOT_OVERLAY_DURATION = 90000; // 90 seconds for system reboot

const validTabs = ['bluetooth', 'appearance', 'system'];

function Settings() {
	const [isRestarting, setIsRestarting] = useState(false);
	const [isRebooting, setIsRebooting] = useState(false);
	const [rebootCountdown, setRebootCountdown] = useState(0);
	const [systemStats, setSystemStats] = useState<SystemStats | null>(null);

	const rebootIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const { colorScheme, setColorScheme } = useMantineColorScheme();

	const { tab } = useParams<{ tab: string; }>();
	const navigate = useNavigate();

	// Determine current tab from URL or default
	const currentTab = tab && validTabs.includes(tab) ? tab : 'bluetooth';

	const handleTabChange = useCallback((value: string | null) => {
		if (value && validTabs.includes(value)) {
			navigate(`/settings/${value}`);
		}
	}, [navigate]);

	// Cleanup interval on unmount
	useEffect(() => {
		return () => {
			if (rebootIntervalRef.current) {
				clearInterval(rebootIntervalRef.current);
			}
		};
	}, []);

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

	const handleReboot = async () => {
		setIsRebooting(true);
		setRebootCountdown(REBOOT_OVERLAY_DURATION / 1000); // Convert to seconds

		try {
			await rebootSystem();
		} catch (error) {
			console.error('Failed to reboot system:', error);
		}

		// Start countdown timer
		rebootIntervalRef.current = setInterval(() => {
			setRebootCountdown((prev) => {
				if (prev <= 1) {
					// Countdown finished, try to reload the page
					if (rebootIntervalRef.current) {
						clearInterval(rebootIntervalRef.current);
						rebootIntervalRef.current = null;
					}
					// Attempt to reload - if system is back up, page will load
					window.location.reload();
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	};

	const formatValue = (value: number | null | undefined, unit: string, decimals: number = 1): string => {
		if (value === null || value === undefined) return '—';
		return `${value.toFixed(decimals)} ${unit}`;
	};

	const formatCountdown = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	const rebootProgress = ((REBOOT_OVERLAY_DURATION / 1000 - rebootCountdown) / (REBOOT_OVERLAY_DURATION / 1000)) * 100;

	return (
		<Box pos="relative" style={{ height: 'var(--main-content-height)' }}>
			{/* Restart Service Overlay */}
			{isRestarting && (
				<LoadingOverlay
					visible={isRestarting}
					zIndex={1000}
					overlayProps={{ radius: 'sm', blur: 2 }}
					loaderProps={{ type: 'dots' }}
					h="100svh"
					mt="calc(0px - var(--header-height))"
				/>
			)}

			{/* Reboot System Overlay */}
			{isRebooting && (
				<Overlay
					fixed
					center
					blur={2}
					zIndex={1000}
				>
					<Stack align="center" gap="lg" w={300}>
						{/*<Power size={48} style={{ color: 'var(--mantine-color-orange-5)' }} />*/}
						<Text size="lg" fw={500} c="white">Rebooting, please wait</Text>
						<Stack w="100%" gap="xs">
							<Progress
								value={rebootProgress}
								size="lg"
								striped
								animated
								color="orange"
							/>
							<Text size="xl" fw={600} c="white" ta="center">
								{formatCountdown(rebootCountdown)}
							</Text>
						</Stack>
						<Text size="sm" c="dimmed" ta="center">
							The page will automatically reload when the system is back online
						</Text>
					</Stack>
				</Overlay>
			)}

			<Tabs
				value={currentTab}
				onChange={handleTabChange}
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
								<Card py="xs">
									<SegmentedControl
										fullWidth
										value={colorScheme}
										transitionDuration={300}
										onChange={(value) => {
											const newTheme = value as 'light' | 'dark';
											setColorScheme(newTheme);
											localStorage.setItem('mantine-color-scheme-value', newTheme);
											localStorage.setItem('user-theme', newTheme);
										}}
										data={[
											{
												value: 'light',
												label: (
													<Center pr="xs" style={{ gap: 10 }}>
														<Sun size={16} />
														<span>Light</span>
													</Center>
												),
											},
											{
												value: 'dark',
												label: (
													<Center pr="xs" style={{ gap: 10 }}>
														<Moon size={16} />
														<span>Dark</span>
													</Center>
												),
											},
											{
												value: 'auto',
												label: (
													<Center pr="xs" style={{ gap: 10 }}>
														<Bot size={16} />
														<span>Auto</span>
													</Center>
												),
											},
										]}
									/>
								</Card>

							</Tabs.Panel>
							<Tabs.Panel value="system">
								<Stack gap="md">
									<Group grow>
										<Button
											variant='light'
											color='pink'
											leftSection={<RefreshCw size={16} />}
											onClick={handleRestartService}
											loading={isRestarting || isRebooting}
											disabled={isRebooting || isRestarting}
										>
											Reset Service
										</Button>
										<Button
											variant='light'
											color='orange'
											leftSection={<Power size={16} />}
											onClick={handleReboot}
											loading={isRebooting || isRestarting}
											disabled={isRestarting || isRebooting}
										>
											Reboot
										</Button>
									</Group>
									{(!systemStats || isRestarting || isRebooting) ? (
										<Stack gap="2px">
											{[...Array(6).keys()].map(i => (
												<Stack gap="2px" key={i}>
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
											))}
										</Stack>
									) : (
										<Stack gap="2px">
											<Card py="xs">
												<Group justify='space-between' pb="sm">
													<Text size='sm'>System</Text>
													<Text size='sm' c="dimmed">{systemStats.os}</Text>
												</Group>
												<Stack gap="0.4rem">
													<Group justify='space-between'>
														<Text c="dimmed" size='sm'>Uptime</Text>
														<Text size='sm'>{systemStats.uptime}</Text>
													</Group>
												</Stack>
											</Card>
											<Card py="xs">
												<Group justify='space-between' pb="sm">
													<Text size='sm'>CPU</Text>
													<Text size='sm' c="dimmed">{systemStats.cpu.cores} Cores</Text>
												</Group>
												<Stack gap="0.4rem">
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