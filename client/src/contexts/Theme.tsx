/**
 * Theme Context
 * Provides custom user theme colors to the entire app with reactive updates.
 * Components using theme colors will automatically re-render when colors change.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { DEFAULT_THEME } from '../utilities';

export interface CustomUserTheme {
	navigation: string;
	mediaPlayer: string;
}

export interface ThemeContextValue {
	theme: CustomUserTheme;
	setNavigationColor: (color: string) => void;
	setMediaPlayerColor: (color: string) => void;
}

/**
 * Get the initial theme from localStorage or return defaults.
 * Also ensures localStorage is initialized if missing.
 */
function getInitialTheme(): CustomUserTheme {
	try {
		const stored = localStorage.getItem('customUserTheme');
		if (stored) {
			const parsed = JSON.parse(stored);
			return {
				navigation: parsed.navigation || DEFAULT_THEME.navigation,
				mediaPlayer: parsed.mediaPlayer || DEFAULT_THEME.mediaPlayer
			};
		}
	} catch {
		// If parsing fails, fall through to initialize defaults
	}

	// Initialize localStorage with defaults if not present
	localStorage.setItem('customUserTheme', JSON.stringify(DEFAULT_THEME));
	return DEFAULT_THEME;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode; }) {
	const [theme, setTheme] = useState<CustomUserTheme>(getInitialTheme);

	const setNavigationColor = useCallback((color: string) => {
		setTheme(prev => {
			const newTheme = { ...prev, navigation: color };
			localStorage.setItem('customUserTheme', JSON.stringify(newTheme));
			return newTheme;
		});
	}, []);

	const setMediaPlayerColor = useCallback((color: string) => {
		setTheme(prev => {
			const newTheme = { ...prev, mediaPlayer: color };
			localStorage.setItem('customUserTheme', JSON.stringify(newTheme));
			return newTheme;
		});
	}, []);

	const value: ThemeContextValue = {
		theme,
		setNavigationColor,
		setMediaPlayerColor
	};

	return (
		<ThemeContext.Provider value={value}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
}
