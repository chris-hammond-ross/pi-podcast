const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');
const downloadQueueService = require('./downloadQueueService');
const episodeService = require('./episodeService');
const constants = require('../config/constants');

/**
 * Download Processor
 * Handles the actual downloading of podcast episodes
 * Processes queue items one at a time with progress tracking
 */
class DownloadProcessor extends EventEmitter {
	constructor(options = {}) {
		super();
		
		this.options = {
			downloadDir: options.downloadDir || constants.DOWNLOAD_DIR,
			delayBetweenDownloads: options.delayBetweenDownloads || constants.DOWNLOAD_DELAY_BETWEEN,
			maxRetries: options.maxRetries || constants.DOWNLOAD_MAX_RETRIES,
			retryDelay: options.retryDelay || constants.DOWNLOAD_RETRY_DELAY,
			connectionTimeout: options.connectionTimeout || constants.DOWNLOAD_CONNECTION_TIMEOUT,
			downloadTimeout: options.downloadTimeout || constants.DOWNLOAD_TIMEOUT,
			progressInterval: options.progressInterval || constants.DOWNLOAD_PROGRESS_INTERVAL,
			minDiskSpace: options.minDiskSpace || constants.DOWNLOAD_MIN_DISK_SPACE,
			queuePollInterval: options.queuePollInterval || 10000,
			maxRedirects: options.maxRedirects || 10,
			...options
		};

		console.log(`[download] Download directory: ${this.options.downloadDir}`);

		this.isRunning = false;
		this.isPaused = false;
		this.currentDownload = null;
		this.currentRequest = null;
		this.cancelRequested = false;
		this.pollTimeoutId = null;
		this.progressThrottleTime = 0;

		// Ensure download directory exists
		this._ensureDownloadDir();
	}

	/**
	 * Ensure download directory exists
	 */
	_ensureDownloadDir() {
		if (!fs.existsSync(this.options.downloadDir)) {
			fs.mkdirSync(this.options.downloadDir, { recursive: true });
			console.log(`[download] Created download directory: ${this.options.downloadDir}`);
		}
	}

	/**
	 * Get subscription directory path
	 * @param {number} subscriptionId - Subscription ID
	 * @returns {string} Directory path
	 */
	_getSubscriptionDir(subscriptionId) {
		const dir = path.join(this.options.downloadDir, String(subscriptionId));
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	/**
	 * Generate safe filename from episode
	 * @param {Object} queueItem - Queue item with episode data
	 * @returns {string} Safe filename
	 */
	_getFileName(queueItem) {
		const safeTitle = (queueItem.episode_title || 'episode')
			.replace(/[^a-z0-9]/gi, '_')
			.replace(/_+/g, '_')
			.substring(0, 100);
		return `${queueItem.episode_id}_${safeTitle}.mp3`;
	}

	/**
	 * Clear any pending poll timeout
	 */
	_clearPollTimeout() {
		if (this.pollTimeoutId) {
			clearTimeout(this.pollTimeoutId);
			this.pollTimeoutId = null;
		}
	}

	/**
	 * Start processing the queue
	 */
	async start() {
		if (this.isRunning) {
			console.log('[download] Processor already running');
			return;
		}

		console.log('[download] Starting download processor');
		this.isRunning = true;
		this.isPaused = false;

		downloadQueueService.recoverInterrupted();

		this.emit('processor:started');
		this._processNext();
	}

	/**
	 * Stop processing the queue
	 */
	async stop() {
		if (!this.isRunning) {
			return;
		}

		console.log('[download] Stopping download processor');
		this.isRunning = false;
		
		this._clearPollTimeout();

		if (this.currentRequest) {
			this.cancelRequested = true;
			this.currentRequest.destroy();
			this.currentRequest = null;
		}

		this.emit('processor:stopped');
	}

	/**
	 * Pause processing
	 */
	pause() {
		if (this.isPaused) return;
		
		console.log('[download] Pausing download processor');
		this.isPaused = true;
		this._clearPollTimeout();
		this.emit('processor:paused');
	}

	/**
	 * Resume processing
	 */
	resume() {
		if (!this.isPaused) return;
		
		console.log('[download] Resuming download processor');
		this.isPaused = false;
		this.emit('processor:resumed');
		
		if (this.isRunning && !this.currentDownload) {
			this._processNext();
		}
	}

	/**
	 * Process next item in queue
	 */
	async _processNext() {
		this._clearPollTimeout();

		if (!this.isRunning || this.isPaused) {
			return;
		}

		const queueItem = downloadQueueService.getNextPending();
		
		if (!queueItem) {
			console.log('[download] Queue empty, waiting for items');
			this.emit('queue:empty');
			
			if (this.isRunning && !this.isPaused) {
				this.pollTimeoutId = setTimeout(() => {
					this._processNext();
				}, this.options.queuePollInterval);
			}
			return;
		}

		await this._downloadItem(queueItem);

		if (this.isRunning && !this.isPaused) {
			this.pollTimeoutId = setTimeout(() => {
				this._processNext();
			}, this.options.delayBetweenDownloads);
		}
	}

	/**
	 * Download a single queue item
	 * @param {Object} queueItem - Queue item with episode data
	 */
	async _downloadItem(queueItem) {
		this.currentDownload = queueItem;
		this.cancelRequested = false;

		console.log(`[download] Starting download: ${queueItem.episode_title}`);
		
		downloadQueueService.updateStatus(queueItem.id, 'downloading');
		
		this.emit('download:started', {
			queueId: queueItem.id,
			episodeId: queueItem.episode_id,
			title: queueItem.episode_title,
			subscriptionName: queueItem.subscription_name,
			totalBytes: queueItem.audio_length || 0
		});

		try {
			const subscriptionDir = this._getSubscriptionDir(queueItem.subscription_id);
			const fileName = this._getFileName(queueItem);
			const tempPath = path.join(subscriptionDir, `${fileName}.tmp`);
			const finalPath = path.join(subscriptionDir, fileName);

			const fileSize = await this._downloadFile(
				queueItem.audio_url,
				tempPath,
				queueItem
			);

			// Verify file exists before renaming
			if (!fs.existsSync(tempPath)) {
				throw new Error('Downloaded file not found');
			}

			fs.renameSync(tempPath, finalPath);

			downloadQueueService.updateStatus(queueItem.id, 'completed');
			episodeService.markAsDownloaded(queueItem.episode_id, finalPath, fileSize);

			console.log(`[download] Completed: ${queueItem.episode_title} (${fileSize} bytes)`);

			this.emit('download:completed', {
				queueId: queueItem.id,
				episodeId: queueItem.episode_id,
				title: queueItem.episode_title,
				filePath: finalPath,
				fileSize
			});

		} catch (err) {
			await this._handleDownloadError(queueItem, err);
		} finally {
			this.currentDownload = null;
			this.currentRequest = null;
			this.cancelRequested = false;
		}
	}

	/**
	 * Follow redirects and get final URL
	 * @param {string} url - Starting URL
	 * @param {number} redirectCount - Current redirect count
	 * @returns {Promise<{response: http.IncomingMessage, request: http.ClientRequest}>}
	 */
	_followRedirects(url, redirectCount = 0) {
		return new Promise((resolve, reject) => {
			if (redirectCount > this.options.maxRedirects) {
				reject(new Error('Too many redirects'));
				return;
			}

			const protocol = url.startsWith('https') ? https : http;
			
			const request = protocol.get(url, {
				headers: {
					'User-Agent': 'PiPodcast/1.0'
				}
			}, (response) => {
				// Handle redirects
				if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
					let redirectUrl = response.headers.location;
					
					// Handle relative redirects
					if (redirectUrl.startsWith('/')) {
						const urlObj = new URL(url);
						redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
					}
					
					console.log(`[download] Following redirect (${redirectCount + 1}): ${redirectUrl}`);
					
					// Consume and destroy this response before following redirect
					response.resume();
					request.destroy();
					
					this._followRedirects(redirectUrl, redirectCount + 1)
						.then(resolve)
						.catch(reject);
					return;
				}

				if (response.statusCode !== 200) {
					response.resume();
					request.destroy();
					reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
					return;
				}

				resolve({ response, request });
			});

			request.on('error', (err) => {
				reject(err);
			});

			// Connection timeout only - not download timeout
			request.setTimeout(this.options.connectionTimeout, () => {
				request.destroy();
				reject(new Error('Connection timeout'));
			});
		});
	}

	/**
	 * Download file with progress tracking
	 * @param {string} url - URL to download
	 * @param {string} destPath - Destination path
	 * @param {Object} queueItem - Queue item for progress updates
	 * @returns {Promise<number>} File size in bytes
	 */
	async _downloadFile(url, destPath, queueItem) {
		// First, follow all redirects to get the final response
		const { response, request } = await this._followRedirects(url);
		
		// Store request reference for cancellation
		this.currentRequest = request;

		return new Promise((resolve, reject) => {
			const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
			let downloadedBytes = 0;
			let settled = false;

			const fileStream = fs.createWriteStream(destPath);

			const settle = (error, result) => {
				if (settled) return;
				settled = true;
				clearTimeout(downloadTimer);
				
				if (error) {
					fileStream.destroy();
					// Only delete file on error, not on success
					if (fs.existsSync(destPath)) {
						try { fs.unlinkSync(destPath); } catch {}
					}
					reject(error);
				} else {
					resolve(result);
				}
			};

			// Download timeout - starts after redirects are resolved
			const downloadTimer = setTimeout(() => {
				console.log('[download] Download timeout triggered');
				request.destroy();
				fileStream.destroy();
				settle(new Error('Download timeout'));
			}, this.options.downloadTimeout);

			response.on('data', (chunk) => {
				downloadedBytes += chunk.length;
				this._emitProgress(queueItem, downloadedBytes, totalBytes);
			});

			response.on('error', (err) => {
				console.log('[download] Response error:', err.message);
				settle(err);
			});

			response.on('aborted', () => {
				console.log('[download] Response aborted');
				if (this.cancelRequested) {
					settle(new Error('Download aborted'));
				} else {
					settle(new Error('Connection aborted by server'));
				}
			});

			response.pipe(fileStream);

			fileStream.on('finish', () => {
				console.log(`[download] File stream finished, ${downloadedBytes} bytes written`);
				clearTimeout(downloadTimer);
				fileStream.close(() => {
					// Emit final 100% progress
					this._emitProgress(queueItem, downloadedBytes, totalBytes || downloadedBytes, true);
					settle(null, downloadedBytes);
				});
			});

			fileStream.on('error', (err) => {
				console.log('[download] File stream error:', err.message);
				settle(err);
			});
		});
	}

	/**
	 * Emit progress update (throttled unless forced)
	 * @param {Object} queueItem - Queue item
	 * @param {number} downloadedBytes - Bytes downloaded
	 * @param {number} totalBytes - Total bytes
	 * @param {boolean} force - Force emit regardless of throttle
	 */
	_emitProgress(queueItem, downloadedBytes, totalBytes, force = false) {
		const now = Date.now();
		
		if (!force && now - this.progressThrottleTime < this.options.progressInterval) {
			return;
		}
		this.progressThrottleTime = now;

		const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

		this.emit('download:progress', {
			queueId: queueItem.id,
			episodeId: queueItem.episode_id,
			title: queueItem.episode_title,
			downloadedBytes,
			totalBytes,
			percent
		});
	}

	/**
	 * Handle download error with retry logic
	 * @param {Object} queueItem - Queue item
	 * @param {Error} err - Error that occurred
	 */
	async _handleDownloadError(queueItem, err) {
		const errorMessage = err.message || 'Unknown error';
		console.error(`[download] Error downloading ${queueItem.episode_title}: ${errorMessage}`);

		if (err.message !== 'Download aborted' && queueItem.retry_count < this.options.maxRetries) {
			const retryCount = downloadQueueService.incrementRetry(queueItem.id);
			console.log(`[download] Retrying (${retryCount}/${this.options.maxRetries}): ${queueItem.episode_title}`);
			
			downloadQueueService.resetToPending(queueItem.id);
			
			this.emit('download:retry', {
				queueId: queueItem.id,
				episodeId: queueItem.episode_id,
				title: queueItem.episode_title,
				retryCount,
				maxRetries: this.options.maxRetries,
				error: errorMessage
			});

			await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
		} else {
			downloadQueueService.updateStatus(queueItem.id, 'failed', errorMessage);

			this.emit('download:failed', {
				queueId: queueItem.id,
				episodeId: queueItem.episode_id,
				title: queueItem.episode_title,
				error: errorMessage
			});
		}
	}

	/**
	 * Cancel current download
	 */
	cancelCurrent() {
		if (this.currentDownload && this.currentRequest) {
			console.log(`[download] Cancelling current download: ${this.currentDownload.episode_title}`);
			downloadQueueService.updateStatus(this.currentDownload.id, 'cancelled');
			this.cancelRequested = true;
			this.currentRequest.destroy();
		}
	}

	/**
	 * Get current status
	 * @returns {Object} Processor status
	 */
	getStatus() {
		const queueStatus = downloadQueueService.getQueueStatus();
		
		return {
			isRunning: this.isRunning,
			isPaused: this.isPaused,
			currentDownload: this.currentDownload ? {
				queueId: this.currentDownload.id,
				episodeId: this.currentDownload.episode_id,
				title: this.currentDownload.episode_title,
				subscriptionName: this.currentDownload.subscription_name
			} : null,
			queue: queueStatus
		};
	}
}

// Create singleton instance
const downloadProcessor = new DownloadProcessor();

module.exports = downloadProcessor;
