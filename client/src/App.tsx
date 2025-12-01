import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layout';
import { Podcasts, Playlists, Search, Settings, Downloads } from './pages';
import { DownloadProvider } from './contexts';

function App() {
	return (
		<MantineProvider defaultColorScheme="auto">
			<Notifications />
			<DownloadProvider>
				<BrowserRouter>
					<Routes>
						<Route path="/" element={<AppLayout />}>
							<Route index element={<Navigate to="/podcasts" replace />} />
							<Route path="podcasts" element={<Podcasts />} />
							<Route path="podcasts/:subscriptionId" element={<Podcasts />} />
							<Route path="podcasts/:subscriptionId/episode/:episodeId" element={<Podcasts />} />
							<Route path="playlists" element={<Playlists />} />
							<Route path="search" element={<Search />} />
							<Route path="search/:podcastId" element={<Search />} />
							<Route path="downloads" element={<Downloads />} />
							<Route path="downloads/:tab" element={<Downloads />} />
							<Route path="downloads/:tab/:episodeId" element={<Downloads />} />
							<Route path="settings" element={<Settings />} />
						</Route>
					</Routes>
				</BrowserRouter>
			</DownloadProvider>
		</MantineProvider>
	);
}

export default App;
