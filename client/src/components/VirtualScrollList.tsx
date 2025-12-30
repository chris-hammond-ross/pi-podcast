import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Card, Loader, Stack } from '@mantine/core';

export interface VirtualScrollListProps<T> {
	/** Function to fetch a page of items */
	fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>;
	/** Number of items to fetch per page */
	pageSize?: number;
	/** Maximum number of items to keep in DOM */
	maxItems?: number;
	/** Render function for each item */
	renderItem: (item: T, index: number) => ReactNode;
	/** Unique key extractor for each item */
	getItemKey: (item: T) => string | number;
	/** Gap between items */
	gap?: string;
	/** Loading indicator color */
	loaderColor?: string;
	/** Empty state content */
	emptyContent?: ReactNode;
	/** Initial loading content */
	loadingContent?: ReactNode;
	/** Threshold in pixels from edge to trigger load */
	loadThreshold?: number;
	/** Dependencies that should trigger a refresh */
	refreshDeps?: unknown[];
	/** Reference to the scroll viewport element (for nested ScrollArea usage) */
	scrollViewportRef?: React.RefObject<HTMLDivElement>;
}

interface ScrollState<T> {
	/** The absolute offset of the first item in our window */
	windowStart: number;
	/** Items currently in our window */
	items: T[];
	/** Total items available on server */
	total: number;
	/** Whether we're loading more items at the top */
	isLoadingTop: boolean;
	/** Whether we're loading more items at the bottom */
	isLoadingBottom: boolean;
	/** Whether initial load is in progress */
	isInitialLoading: boolean;
	/** Error message if any */
	error: string | null;
}

export function VirtualScrollList<T>({
	fetchPage,
	pageSize = 100,
	maxItems = 500,
	renderItem,
	getItemKey,
	gap = 'xs',
	loaderColor = 'blue',
	emptyContent,
	loadingContent,
	loadThreshold = 200,
	refreshDeps = [],
	scrollViewportRef
}: VirtualScrollListProps<T>) {
	const [state, setState] = useState<ScrollState<T>>({
		windowStart: 0,
		items: [],
		total: 0,
		isLoadingTop: false,
		isLoadingBottom: false,
		isInitialLoading: true,
		error: null
	});

	const containerRef = useRef<HTMLDivElement>(null);
	const isLoadingRef = useRef(false);
	const lastScrollTopRef = useRef(0);

	// Calculate if we can load more in each direction
	const canLoadTop = state.windowStart > 0;
	const canLoadBottom = state.windowStart + state.items.length < state.total;

	// Initial load
	useEffect(() => {
		const loadInitial = async () => {
			setState(prev => ({ ...prev, isInitialLoading: true, error: null }));
			
			try {
				const result = await fetchPage(0, pageSize);
				setState({
					windowStart: 0,
					items: result.items,
					total: result.total,
					isLoadingTop: false,
					isLoadingBottom: false,
					isInitialLoading: false,
					error: null
				});
			} catch (err) {
				setState(prev => ({
					...prev,
					isInitialLoading: false,
					error: err instanceof Error ? err.message : 'Failed to load items'
				}));
			}
		};

		loadInitial();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...refreshDeps]);

	// Load more items at the bottom
	const loadBottom = useCallback(async () => {
		if (isLoadingRef.current || !canLoadBottom) return;
		
		isLoadingRef.current = true;
		setState(prev => ({ ...prev, isLoadingBottom: true }));

		try {
			const newOffset = state.windowStart + state.items.length;
			const result = await fetchPage(newOffset, pageSize);

			setState(prev => {
				let newItems = [...prev.items, ...result.items];
				let newWindowStart = prev.windowStart;

				// If we exceed maxItems, remove from the top
				if (newItems.length > maxItems) {
					const removeCount = newItems.length - maxItems;
					newItems = newItems.slice(removeCount);
					newWindowStart += removeCount;
				}

				return {
					...prev,
					windowStart: newWindowStart,
					items: newItems,
					total: result.total,
					isLoadingBottom: false
				};
			});
		} catch (err) {
			setState(prev => ({
				...prev,
				isLoadingBottom: false,
				error: err instanceof Error ? err.message : 'Failed to load more items'
			}));
		} finally {
			isLoadingRef.current = false;
		}
	}, [canLoadBottom, state.windowStart, state.items.length, fetchPage, pageSize, maxItems]);

	// Load more items at the top
	const loadTop = useCallback(async () => {
		if (isLoadingRef.current || !canLoadTop) return;

		isLoadingRef.current = true;
		setState(prev => ({ ...prev, isLoadingTop: true }));

		// Store scroll position data before loading
		const viewport = scrollViewportRef?.current;
		const container = containerRef.current;
		const scrollHeightBefore = container?.scrollHeight || 0;

		try {
			// Calculate how many items to fetch (up to pageSize, but don't go below 0)
			const fetchCount = Math.min(pageSize, state.windowStart);
			const newOffset = state.windowStart - fetchCount;
			const result = await fetchPage(newOffset, fetchCount);

			setState(prev => {
				let newItems = [...result.items, ...prev.items];
				const newWindowStart = newOffset;

				// If we exceed maxItems, remove from the bottom
				if (newItems.length > maxItems) {
					newItems = newItems.slice(0, maxItems);
				}

				return {
					...prev,
					windowStart: newWindowStart,
					items: newItems,
					total: result.total,
					isLoadingTop: false
				};
			});

			// Restore scroll position after DOM update
			requestAnimationFrame(() => {
				if (viewport && container) {
					const scrollHeightAfter = container.scrollHeight;
					const scrollDiff = scrollHeightAfter - scrollHeightBefore;
					viewport.scrollTop = viewport.scrollTop + scrollDiff;
				}
			});
		} catch (err) {
			setState(prev => ({
				...prev,
				isLoadingTop: false,
				error: err instanceof Error ? err.message : 'Failed to load more items'
			}));
		} finally {
			isLoadingRef.current = false;
		}
	}, [canLoadTop, state.windowStart, fetchPage, pageSize, maxItems, scrollViewportRef]);

	// Handle scroll events
	const handleScroll = useCallback(() => {
		const viewport = scrollViewportRef?.current;
		if (!viewport || isLoadingRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = viewport;
		const scrollBottom = scrollHeight - scrollTop - clientHeight;
		const scrollDirection = scrollTop > lastScrollTopRef.current ? 'down' : 'up';
		lastScrollTopRef.current = scrollTop;

		// Load more at bottom when scrolling down and near the bottom
		if (scrollDirection === 'down' && scrollBottom < loadThreshold && canLoadBottom) {
			loadBottom();
		}

		// Load more at top when scrolling up and near the top
		if (scrollDirection === 'up' && scrollTop < loadThreshold && canLoadTop) {
			loadTop();
		}
	}, [loadBottom, loadTop, canLoadBottom, canLoadTop, loadThreshold, scrollViewportRef]);

	// Set up scroll listener on the provided viewport
	useEffect(() => {
		const viewport = scrollViewportRef?.current;
		if (!viewport) return;

		viewport.addEventListener('scroll', handleScroll, { passive: true });
		return () => viewport.removeEventListener('scroll', handleScroll);
	}, [handleScroll, scrollViewportRef]);

	// Initial loading state
	if (state.isInitialLoading) {
		return <>{loadingContent || (
			<Card p="sm" style={{ display: 'flex', justifyContent: 'center' }}>
				<Loader color={loaderColor} type="dots" />
			</Card>
		)}</>;
	}

	// Empty state
	if (state.items.length === 0 && state.total === 0) {
		return <>{emptyContent}</>;
	}

	return (
		<div ref={containerRef}>
			<Stack gap={gap}>
				{/* Top loading indicator */}
				{state.isLoadingTop && (
					<Card p="sm" style={{ display: 'flex', justifyContent: 'center' }}>
						<Loader color={loaderColor} type="dots" />
					</Card>
				)}

				{/* Rendered items */}
				{state.items.map((item, index) => (
					<div key={getItemKey(item)}>
						{renderItem(item, state.windowStart + index)}
					</div>
				))}

				{/* Bottom loading indicator */}
				{state.isLoadingBottom && (
					<Card p="sm" style={{ display: 'flex', justifyContent: 'center' }}>
						<Loader color={loaderColor} type="dots" />
					</Card>
				)}
			</Stack>
		</div>
	);
}

export default VirtualScrollList;
