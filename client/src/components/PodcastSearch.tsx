/**
 * Podcast Search Component
 * Provides a search input with debounced search functionality
 */
import { useState, useEffect } from 'react';
import { TextInput, Loader } from '@mantine/core';
import { Search, X } from 'lucide-react';
import { usePodcastSearch } from '../hooks/usePodcastSearch';

interface PodcastSearchProps {
	onResultsChange?: (count: number) => void;
	placeholder?: string;
	debounceMs?: number;
}

export function PodcastSearch({
	onResultsChange,
	placeholder = 'Search for podcasts...',
	debounceMs = 500
}: PodcastSearchProps) {
	const [searchTerm, setSearchTerm] = useState('');
	const { results, isSearching, error, search, clearResults } = usePodcastSearch();

	// Debounced search effect
	useEffect(() => {
		if (!searchTerm || searchTerm.trim().length === 0) {
			clearResults();
			return;
		}

		const timer = setTimeout(() => {
			search(searchTerm);
		}, debounceMs);

		return () => clearTimeout(timer);
	}, [searchTerm, debounceMs, search, clearResults]);

	// Notify parent of results changes
	useEffect(() => {
		if (onResultsChange) {
			onResultsChange(results.length);
		}
	}, [results.length, onResultsChange]);

	const handleClear = () => {
		setSearchTerm('');
		clearResults();
	};

	return (
		<TextInput
			value={searchTerm}
			onChange={(event) => setSearchTerm(event.currentTarget.value)}
			placeholder={placeholder}
			leftSection={
				isSearching ? (
					<Loader size="xs" />
				) : (
					<Search size={16} />
				)
			}
			rightSection={
				searchTerm && (
					<X
						size={16}
						style={{ cursor: 'pointer' }}
						onClick={handleClear}
					/>
				)
			}
			error={error}
		/>
	);
}