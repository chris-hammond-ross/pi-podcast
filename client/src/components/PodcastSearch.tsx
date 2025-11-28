/**
 * Podcast Search Component
 * Provides a search input with debounced search functionality
 */
import { useState, useEffect } from 'react';
import { TextInput, Loader } from '@mantine/core';
import { Search, X } from 'lucide-react';
import { usePodcastSearch } from '../hooks/usePodcastSearch';
import type { Podcast } from '../services';

interface PodcastSearchProps {
	onResultsChange?: (count: number, results: Podcast[]) => void;
	placeholder?: string;
	debounceMs?: number;
}

function PodcastSearch({
	onResultsChange,
	placeholder = 'Search for podcasts...'
}: PodcastSearchProps) {
	const [searchTerm, setSearchTerm] = useState('');
	const { results, isSearching, error, search, clearResults } = usePodcastSearch();

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			if (searchTerm.trim().length > 0) {
				search(searchTerm);
			}
		}
	};

	// Notify parent of results changes
	useEffect(() => {
		if (onResultsChange) {
			onResultsChange(results.length, results);
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
			onKeyDown={handleKeyDown}
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

export default PodcastSearch;