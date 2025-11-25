import { AppShell, Button, Group, Container, rem } from '@mantine/core';
import { Mic, ListMusic, Search, Settings } from 'lucide-react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';

function AppLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const isMobile = useMediaQuery('(max-width: 768px)');
	const isActive = (path: string) => location.pathname === path;

	const navItems = [
		{ path: '/podcasts', label: 'Podcasts', icon: Mic },
		{ path: '/playlists', label: 'Playlists', icon: ListMusic },
		{ path: '/search', label: 'Search', icon: Search },
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
						px={isMobile ? 8 : 16}
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
				p={isMobile ? 8 : 16}
				style={{
					position: 'fixed',
					bottom: 0,
					left: 0,
					right: 0,
					height: rem(80),
					backgroundColor: 'var(--mantine-color-body)',
					borderTop: `${rem(1)} solid var(--mantine-color-default-border)`,
					zIndex: 100,
				}}
			>
				{/* Media player placeholder */}
				<div style={{ color: 'var(--mantine-color-dimmed)' }}>
					Media Player Controls
				</div>
			</Group>
		</AppShell>
	);
}

export default AppLayout;