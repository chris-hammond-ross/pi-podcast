const { COMMAND_QUEUE_DELAY } = require('../config/constants');

/**
 * Command queue for serializing bluetoothctl commands
 * Ensures commands don't overlap and are executed sequentially
 */
class CommandQueue {
	constructor() {
		this.queue = [];
		this.isProcessing = false;
	}

	/**
	 * Queue a command to be executed
	 * @param {Function} executeCommand - The command execution function
	 * @param {string} command - The command string
	 * @param {number} timeout - Command timeout in ms
	 * @returns {Promise} Promise that resolves with the command output
	 */
	queueCommand(executeCommand, command, timeout = 5000) {
		return new Promise((resolve, reject) => {
			this.queue.push({ executeCommand, command, timeout, resolve, reject });
			this.processQueue();
		});
	}

	/**
	 * Process the command queue sequentially
	 */
	async processQueue() {
		if (this.isProcessing || this.queue.length === 0) return;

		this.isProcessing = true;
		const { executeCommand, command, timeout, resolve, reject } = this.queue.shift();

		try {
			const result = await executeCommand(command, timeout);
			resolve(result);
		} catch (err) {
			reject(err);
		} finally {
			this.isProcessing = false;
			// Process next command after a small delay
			setTimeout(() => this.processQueue(), COMMAND_QUEUE_DELAY);
		}
	}

	/**
	 * Get the current queue length
	 * @returns {number} The number of commands in the queue
	 */
	getQueueLength() {
		return this.queue.length;
	}

	/**
	 * Clear all queued commands
	 */
	clearQueue() {
		this.queue = [];
		this.isProcessing = false;
	}
}

module.exports = CommandQueue;
