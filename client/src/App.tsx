import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layout';
import { Podcasts, Playlists, Search, Settings } from './pages';

function App() {
	return (
		<MantineProvider defaultColorScheme="auto">
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<AppLayout />}>
						<Route index element={<Navigate to="/podcasts" replace />} />
						<Route path="podcasts" element={<Podcasts />} />
						<Route path="playlists" element={<Playlists />} />
						<Route path="search" element={<Search />} />
						<Route path="settings" element={<Settings />} />
					</Route>
				</Routes>
			</BrowserRouter>
		</MantineProvider>
	);
}

export default App;