import { AppShell, Button, Group, Container, Indicator, rem } from '@mantine/core';
import { Mic, ListMusic, Search, Settings, HardDriveDownload } from 'lucide-react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';
import { useDownloadContext } from '../contexts';
import { MediaPlayer } from '../components';

function AppLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const isMobile = useMediaQuery('(max-width: 768px)');
	const isActive = (path: string) => location.pathname === path;
	const { isActive: isDownloading } = useDownloadContext();

	const navItems = [
		{ path: '/podcasts', label: 'Podcasts', icon: Mic },
		{ path: '/playlists', label: 'Playlists', icon: ListMusic },
		{ path: '/search', label: 'Search', icon: Search }
	];

	return (
		<AppShell
			header={{ height: 60 }}
			// padding="md"
			styles={{
				main: {
					paddingBottom: rem(80),
				},
			}}
		>
			<AppShell.Header>
				<Container size="sm" px="0" h="100%">
					<Group
						align='center'
						justify="space-between"
						h="100%"
						px={16}
					>
						<Group gap="xs">
							{navItems.map(({ path, label, icon: Icon }) => (
								<Button
									key={path}
									variant={isActive(path) ? 'filled' : 'light'}
									leftSection={isMobile ? undefined : <Icon size={18} />}
									onClick={() => navigate(path)}
								>
									{isMobile ? <Icon size={18} /> : label}
								</Button>
							))}
							<Indicator color="teal" offset={2} disabled={!isDownloading} processing={isDownloading}>
								<Button
									variant={isActive('/downloads') ? 'filled' : 'light'}
									leftSection={isMobile ? undefined : <HardDriveDownload size={18} />}
									onClick={() => navigate('/downloads')}
								>
									{isMobile ? <HardDriveDownload size={18} /> : "Downloads"}
								</Button>
							</Indicator>
						</Group>

						<Button
							variant={isActive('/settings') ? 'filled' : 'light'}
							leftSection={isMobile ? undefined : <Settings size={18} />}
							onClick={() => navigate('/settings')}
						>
							{isMobile ? <Settings size={18} /> : "Settings"}
						</Button>
					</Group>
				</Container>
			</AppShell.Header>

			<AppShell.Main>
				<Outlet />
			</AppShell.Main>

			<Group
				justify="center"
				align="center"
				style={{
					position: 'fixed',
					bottom: 0,
					left: 0,
					right: 0,
					height: "var(--media-control-height)",
					backgroundColor: 'var(--mantine-color-body)',
					borderTop: `${rem(1)} solid var(--mantine-color-default-border)`,
					zIndex: 100,
				}}
			>
				{/* Media player placeholder */}
				{/*<div style={{ color: 'var(--mantine-color-dimmed)' }}>
					Media Player Controls
				</div>*/}
				<MediaPlayer />
			</Group>
		</AppShell>
	);
}

export default AppLayout;
