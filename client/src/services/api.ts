/**
 * API service for general backend communication
 * Provides error handling and request utilities
 */

export interface ApiError {
	status: number;
	detail: string;
	message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Makes a GET request to the API
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
	return apiRequest<T>(endpoint, {
		method: 'GET',
	});
}

/**
 * Makes a POST request to the API
 */
export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
	return apiRequest<T>(endpoint, {
		method: 'POST',
		body: body ? JSON.stringify(body) : undefined,
	});
}

/**
 * Generic API request handler with error handling
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

	const defaultHeaders: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	const response = await fetch(url, {
		...options,
		headers: {
			...defaultHeaders,
			...(options.headers as Record<string, string>),
		},
	});

	if (!response.ok) {
		let errorDetail = `HTTP ${response.status}`;
		try {
			const errorData = (await response.json()) as ApiError;
			errorDetail = errorData.detail || errorData.message || errorDetail;
		} catch {
			// Response was not JSON
		}
		throw new Error(errorDetail);
	}

	return response.json() as Promise<T>;
}

/**
 * Gets the base API URL
 */
export function getApiUrl(): string {
	return API_BASE_URL;
}
