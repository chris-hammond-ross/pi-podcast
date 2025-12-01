/**
 * Podcast Search Component
 * Provides a search input with debounced search functionality
 */
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TextInput, Loader } from '@mantine/core';
import { Search, X } from 'lucide-react';
import { usePodcastSearch } from '../hooks/usePodcastSearch';
import type { Podcast } from '../services';

interface PodcastSearchProps {
	onResultsChange?: (count: number, results: Podcast[], searchTerm: string) => void;
	placeholder?: string;
	debounceMs?: number;
}

function PodcastSearch({
	onResultsChange,
	placeholder = 'Search for podcasts...'
}: PodcastSearchProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialQuery = searchParams.get('q') || '';
	
	const [searchTerm, setSearchTerm] = useState(initialQuery);
	const [submittedTerm, setSubmittedTerm] = useState(initialQuery);
	const { results, isSearching, error, search, clearResults } = usePodcastSearch();
	
	// Use ref to store callback to avoid stale closures
	const onResultsChangeRef = useRef(onResultsChange);
	onResultsChangeRef.current = onResultsChange;
	
	// Track if we've done the initial search
	const hasInitialSearched = useRef(false);

	// Perform initial search if there's a query in the URL
	useEffect(() => {
		if (initialQuery && !hasInitialSearched.current) {
			hasInitialSearched.current = true;
			search(initialQuery);
		}
	}, [initialQuery, search]);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			if (searchTerm.trim().length > 0) {
				const trimmedTerm = searchTerm.trim();
				setSubmittedTerm(trimmedTerm);
				// Update URL with search query
				setSearchParams({ q: trimmedTerm }, { replace: true });
				search(trimmedTerm);
			}
		}
	};

	// Notify parent of results changes
	useEffect(() => {
		if (onResultsChangeRef.current) {
			onResultsChangeRef.current(results.length, results, submittedTerm);
		}
	}, [results, submittedTerm]);

	const handleClear = () => {
		setSearchTerm('');
		setSubmittedTerm('');
		// Remove query from URL
		setSearchParams({}, { replace: true });
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
