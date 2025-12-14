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

/**
 * System stats types
 */
export interface CpuInfo {
	frequency: number | null;
	cores: number;
}

export interface MemoryInfo {
	total: number;
	used: number;
	free: number;
	usage_percentage: number;
}

export interface DiskInfo {
	total: number | null;
	used: number | null;
	free: number | null;
	usage_percentage: number | null;
}

export interface SystemStats {
	os: string;
	timestamp: number;
	cpu: CpuInfo;
	memory: MemoryInfo;
	disk: DiskInfo;
	temperature: number | null;
	uptime: string;
}
