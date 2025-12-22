const { getDatabase } = require('../config/database');

class Device {
	constructor() {
		this.db = null;
		this.statements = null;
	}

	/**
	 * Lazy-load database connection and initialize prepared statements
	 */
	ensureInitialized() {
		if (!this.db) {
			this.db = getDatabase();
			this.initializePreparedStatements();
		}
	}

	initializePreparedStatements() {
		this.statements = {
			getByMac: this.db.prepare('SELECT * FROM bluetooth_devices WHERE mac_address = ?'),
			getAllPaired: this.db.prepare('SELECT * FROM bluetooth_devices WHERE paired = 1'),
			getLastConnected: this.db.prepare('SELECT * FROM bluetooth_devices WHERE last_connected = 1 AND paired = 1 LIMIT 1'),
			insert: this.db.prepare(`
				INSERT INTO bluetooth_devices (mac_address, name, rssi, last_seen)
				VALUES (?, ?, ?, strftime('%s', 'now'))
			`),
			update: this.db.prepare(`
				UPDATE bluetooth_devices
				SET name = ?, rssi = ?, last_seen = strftime('%s', 'now')
				WHERE mac_address = ?
			`),
			updatePaired: this.db.prepare(`
				UPDATE bluetooth_devices
				SET paired = ?, last_seen = strftime('%s', 'now')
				WHERE mac_address = ?
			`),
			updateTrusted: this.db.prepare(`
				UPDATE bluetooth_devices
				SET trusted = ?, last_seen = strftime('%s', 'now')
				WHERE mac_address = ?
			`),
			clearLastConnected: this.db.prepare(`
				UPDATE bluetooth_devices
				SET last_connected = 0
				WHERE last_connected = 1
			`),
			setLastConnected: this.db.prepare(`
				UPDATE bluetooth_devices
				SET last_connected = 1, last_seen = strftime('%s', 'now')
				WHERE mac_address = ?
			`),
			delete: this.db.prepare('DELETE FROM bluetooth_devices WHERE mac_address = ?')
		};
	}

	/**
	 * Get a device by MAC address
	 * @param {string} mac - The MAC address
	 * @returns {Object|undefined} The device object or undefined
	 */
	getByMac(mac) {
		this.ensureInitialized();
		return this.statements.getByMac.get(mac);
	}

	/**
	 * Get all paired devices
	 * @returns {Array} Array of paired devices
	 */
	getAllPaired() {
		this.ensureInitialized();
		return this.statements.getAllPaired.all();
	}

	/**
	 * Get the last connected device (if any)
	 * @returns {Object|undefined} The last connected device or undefined
	 */
	getLastConnected() {
		this.ensureInitialized();
		return this.statements.getLastConnected.get();
	}

	/**
	 * Set a device as the last connected device
	 * Clears the flag from any other device first
	 * @param {string} mac - The MAC address of the device to mark as last connected
	 */
	setLastConnected(mac) {
		this.ensureInitialized();
		// Use a transaction to ensure atomicity
		const transaction = this.db.transaction(() => {
			this.statements.clearLastConnected.run();
			this.statements.setLastConnected.run(mac);
		});
		transaction();
	}

	/**
	 * Clear the last connected flag from all devices
	 */
	clearLastConnected() {
		this.ensureInitialized();
		this.statements.clearLastConnected.run();
	}

	/**
	 * Insert a new device
	 * @param {string} mac - The MAC address
	 * @param {string} name - The device name
	 * @param {number} rssi - The RSSI value
	 * @returns {Object} The result of the insert operation
	 */
	insert(mac, name, rssi = -70) {
		this.ensureInitialized();
		try {
			return this.statements.insert.run(mac, name, rssi);
		} catch (err) {
			if (!err.message.includes('UNIQUE constraint failed')) {
				throw err;
			}
			return null;
		}
	}

	/**
	 * Update a device's name and RSSI
	 * @param {string} mac - The MAC address
	 * @param {string} name - The device name
	 * @param {number} rssi - The RSSI value
	 * @returns {Object} The result of the update operation
	 */
	update(mac, name, rssi) {
		this.ensureInitialized();
		return this.statements.update.run(name, rssi, mac);
	}

	/**
	 * Update a device's paired status
	 * @param {string} mac - The MAC address
	 * @param {boolean} paired - The paired status
	 * @returns {Object} The result of the update operation
	 */
	updatePaired(mac, paired) {
		this.ensureInitialized();
		return this.statements.updatePaired.run(paired ? 1 : 0, mac);
	}

	/**
	 * Update a device's trusted status
	 * @param {string} mac - The MAC address
	 * @param {boolean} trusted - The trusted status
	 * @returns {Object} The result of the update operation
	 */
	updateTrusted(mac, trusted) {
		this.ensureInitialized();
		return this.statements.updateTrusted.run(trusted ? 1 : 0, mac);
	}

	/**
	 * Delete a device from the database
	 * @param {string} mac - The MAC address
	 * @returns {Object} The result of the delete operation
	 */
	delete(mac) {
		this.ensureInitialized();
		return this.statements.delete.run(mac);
	}
}

module.exports = Device;
