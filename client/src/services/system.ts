/**
 * System service for system-level operations
 */

import { apiPost } from './api';

interface RestartResponse {
	success: boolean;
	message?: string;
	error?: string;
}

/**
 * Restart the pi-podcast services
 */
export async function restartServices(): Promise<RestartResponse> {
	return apiPost<RestartResponse>('/api/system/restart');
}
