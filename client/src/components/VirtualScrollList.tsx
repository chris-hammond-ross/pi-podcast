import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from 'react';
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
}

interface ScrollState<T> {
	/** The absolute offset of the first item in our window */
	windowStart: number;
	/** Items currently in our window */
	items: T[];
	/** Total items available on server */
	total: number;
	/** Whether initial load is in progress */
	isInitialLoading: boolean;
	/** Error message if any */
	error: string | null;
}

/**
 * Find the nearest scrollable ancestor element
 */
function findScrollParent(element: HTMLElement | null): HTMLElement | null {
	if (!element) return null;

	let parent = element.parentElement;
	while (parent) {
		const style = window.getComputedStyle(parent);
		const overflowY = style.overflowY;

		// Check if this element is scrollable
		if (overflowY === 'auto' || overflowY === 'scroll') {
			// Also check if it actually has scrollable content
			if (parent.scrollHeight > parent.clientHeight) {
				return parent;
			}
		}

		// Special case: Mantine/Radix ScrollArea viewport
		if (parent.hasAttribute('data-radix-scroll-area-viewport')) {
			return parent;
		}

		parent = parent.parentElement;
	}

	return null;
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
	refreshDeps = []
}: VirtualScrollListProps<T>) {
	const [state, setState] = useState<ScrollState<T>>({
		windowStart: 0,
		items: [],
		total: 0,
		isInitialLoading: true,
		error: null
	});

	const containerRef = useRef<HTMLDivElement>(null);
	const scrollParentRef = useRef<HTMLElement | null>(null);
	const isLoadingRef = useRef(false);
	const lastScrollTopRef = useRef(0);
	
	// Track pending scroll restoration for prepending items
	const pendingScrollRestoration = useRef<{
		scrollHeightBefore: number;
		scrollTopBefore: number;
	} | null>(null);

	// Calculate if we can load more in each direction
	const canLoadTop = state.windowStart > 0;
	const canLoadBottom = state.windowStart + state.items.length < state.total;

	// Restore scroll position after items are prepended at the top
	// useLayoutEffect runs synchronously after DOM updates but before paint
	useLayoutEffect(() => {
		const pending = pendingScrollRestoration.current;
		if (pending !== null) {
			const scrollParent = scrollParentRef.current;
			const container = containerRef.current;
			
			if (scrollParent && container) {
				const scrollHeightAfter = container.scrollHeight;
				const scrollDiff = scrollHeightAfter - pending.scrollHeightBefore;
				
				// Set scroll position to maintain the user's view
				scrollParent.scrollTop = pending.scrollTopBefore + scrollDiff;
				
				// Update lastScrollTopRef to prevent triggering another load
				lastScrollTopRef.current = scrollParent.scrollTop;
			}
			
			// Clear the pending restoration
			pendingScrollRestoration.current = null;
		}
	}, [state.items]);

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
					total: result.total
				};
			});
		} catch (err) {
			setState(prev => ({
				...prev,
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

		// Store scroll position info before loading - will be used in useLayoutEffect
		const container = containerRef.current;
		const scrollParent = scrollParentRef.current;
		
		if (container && scrollParent) {
			pendingScrollRestoration.current = {
				scrollHeightBefore: container.scrollHeight,
				scrollTopBefore: scrollParent.scrollTop
			};
		}

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
					total: result.total
				};
			});
		} catch (err) {
			// Clear the pending restoration on error
			pendingScrollRestoration.current = null;
			setState(prev => ({
				...prev,
				error: err instanceof Error ? err.message : 'Failed to load more items'
			}));
		} finally {
			isLoadingRef.current = false;
		}
	}, [canLoadTop, state.windowStart, fetchPage, pageSize, maxItems]);

	// Handle scroll events
	const handleScroll = useCallback(() => {
		const scrollParent = scrollParentRef.current;
		if (!scrollParent || isLoadingRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollParent;
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
	}, [loadBottom, loadTop, canLoadBottom, canLoadTop, loadThreshold]);

	// Find scroll parent and set up scroll listener
	useEffect(() => {
		// Use a small delay to ensure the DOM is fully rendered
		const timeoutId = setTimeout(() => {
			if (containerRef.current) {
				const scrollParent = findScrollParent(containerRef.current);
				scrollParentRef.current = scrollParent;

				if (scrollParent) {
					scrollParent.addEventListener('scroll', handleScroll, { passive: true });
				}
			}
		}, 50);

		return () => {
			clearTimeout(timeoutId);
			if (scrollParentRef.current) {
				scrollParentRef.current.removeEventListener('scroll', handleScroll);
			}
		};
	}, [handleScroll]);

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
				{/* Top loading indicator - show when more items available above */}
				{canLoadTop && (
					<Card p="sm" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
						<Loader color={loaderColor} type="dots" />
					</Card>
				)}

				{/* Rendered items */}
				{state.items.map((item, index) => (
					<div key={getItemKey(item)}>
						{renderItem(item, state.windowStart + index)}
					</div>
				))}

				{/* Bottom loading indicator - show when more items available below */}
				{canLoadBottom && (
					<Card p="sm" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
						<Loader color={loaderColor} type="dots" />
					</Card>
				)}
			</Stack>
		</div>
	);
}

export default VirtualScrollList;
