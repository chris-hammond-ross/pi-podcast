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
			queuePollInterval: options.queuePollInterval || 10000, // 10 seconds between empty queue checks
			...options
		};

		console.log(`[download] Download directory: ${this.options.downloadDir}`);

		this.isRunning = false;
		this.isPaused = false;
		this.currentDownload = null;
		this.abortController = null;
		this.progressThrottleTime = 0;
		this.pollTimeoutId = null;

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
		// Use episode ID for uniqueness, sanitize title for readability
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

		// Recover any interrupted downloads from previous run
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
		
		// Clear any pending poll
		this._clearPollTimeout();

		// Abort current download if any
		if (this.abortController) {
			this.abortController.abort();
		}

		this.emit('processor:stopped');
	}

	/**
	 * Pause processing (finish current, don't start new)
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
		// Clear any existing poll timeout
		this._clearPollTimeout();

		// Check if we should continue
		if (!this.isRunning || this.isPaused) {
			return;
		}

		const queueItem = downloadQueueService.getNextPending();
		
		if (!queueItem) {
			// Queue is empty - emit once and schedule next poll
			console.log('[download] Queue empty, waiting for items');
			this.emit('queue:empty');
			
			// Schedule next check (only if still running)
			if (this.isRunning && !this.isPaused) {
				this.pollTimeoutId = setTimeout(() => {
					this._processNext();
				}, this.options.queuePollInterval);
			}
			return;
		}

		await this._downloadItem(queueItem);

		// Schedule next download (only if still running)
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
		this.abortController = new AbortController();

		console.log(`[download] Starting download: ${queueItem.episode_title}`);
		
		// Update status to downloading
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

			// Download the file
			const fileSize = await this._downloadFile(
				queueItem.audio_url,
				tempPath,
				queueItem
			);

			// Rename temp to final
			fs.renameSync(tempPath, finalPath);

			// Mark as completed
			downloadQueueService.updateStatus(queueItem.id, 'completed');
			episodeService.markAsDownloaded(queueItem.episode_id, finalPath, fileSize);

			console.log(`[download] Completed: ${queueItem.episode_title}`);

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
			this.abortController = null;
		}
	}

	/**
	 * Download file with progress tracking
	 * @param {string} url - URL to download
	 * @param {string} destPath - Destination path
	 * @param {Object} queueItem - Queue item for progress updates
	 * @returns {Promise<number>} File size in bytes
	 */
	_downloadFile(url, destPath, queueItem) {
		return new Promise((resolve, reject) => {
			const protocol = url.startsWith('https') ? https : http;
			
			const request = protocol.get(url, {
				timeout: this.options.connectionTimeout,
				headers: {
					'User-Agent': 'PiPodcast/1.0'
				}
			}, (response) => {
				// Handle redirects
				if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
					console.log(`[download] Following redirect to: ${response.headers.location}`);
					this._downloadFile(response.headers.location, destPath, queueItem)
						.then(resolve)
						.catch(reject);
					return;
				}

				if (response.statusCode !== 200) {
					reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
					return;
				}

				const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
				let downloadedBytes = 0;

				const fileStream = fs.createWriteStream(destPath);

				// Set download timeout
				const downloadTimer = setTimeout(() => {
					request.destroy();
					fileStream.destroy();
					reject(new Error('Download timeout'));
				}, this.options.downloadTimeout);

				// Handle abort
				if (this.abortController) {
					this.abortController.signal.addEventListener('abort', () => {
						clearTimeout(downloadTimer);
						request.destroy();
						fileStream.destroy();
						// Clean up temp file
						if (fs.existsSync(destPath)) {
							fs.unlinkSync(destPath);
						}
						reject(new Error('Download aborted'));
					});
				}

				response.on('data', (chunk) => {
					downloadedBytes += chunk.length;
					this._emitProgress(queueItem, downloadedBytes, totalBytes);
				});

				response.pipe(fileStream);

				fileStream.on('finish', () => {
					clearTimeout(downloadTimer);
					fileStream.close();
					resolve(downloadedBytes);
				});

				fileStream.on('error', (err) => {
					clearTimeout(downloadTimer);
					fileStream.destroy();
					// Clean up temp file
					if (fs.existsSync(destPath)) {
						fs.unlinkSync(destPath);
					}
					reject(err);
				});
			});

			request.on('error', (err) => {
				reject(err);
			});

			request.on('timeout', () => {
				request.destroy();
				reject(new Error('Connection timeout'));
			});
		});
	}

	/**
	 * Emit progress update (throttled)
	 * @param {Object} queueItem - Queue item
	 * @param {number} downloadedBytes - Bytes downloaded
	 * @param {number} totalBytes - Total bytes
	 */
	_emitProgress(queueItem, downloadedBytes, totalBytes) {
		const now = Date.now();
		
		// Throttle progress updates
		if (now - this.progressThrottleTime < this.options.progressInterval) {
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

		// Check if we should retry
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

			// Wait before retry
			await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
		} else {
			// Mark as failed
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
		if (this.currentDownload && this.abortController) {
			console.log(`[download] Cancelling current download: ${this.currentDownload.episode_title}`);
			downloadQueueService.updateStatus(this.currentDownload.id, 'cancelled');
			this.abortController.abort();
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
