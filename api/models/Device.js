const { getDatabase } = require('../config/database');

class Device {
	constructor() {
		this.db = getDatabase();
		this.initializePreparedStatements();
	}

	initializePreparedStatements() {
		this.statements = {
			getByMac: this.db.prepare('SELECT * FROM bluetooth_devices WHERE mac_address = ?'),
			getAllPaired: this.db.prepare('SELECT * FROM bluetooth_devices WHERE paired = 1'),
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
			`)
		};
	}

	/**
	 * Get a device by MAC address
	 * @param {string} mac - The MAC address
	 * @returns {Object|undefined} The device object or undefined
	 */
	getByMac(mac) {
		return this.statements.getByMac.get(mac);
	}

	/**
	 * Get all paired devices
	 * @returns {Array} Array of paired devices
	 */
	getAllPaired() {
		return this.statements.getAllPaired.all();
	}

	/**
	 * Insert a new device
	 * @param {string} mac - The MAC address
	 * @param {string} name - The device name
	 * @param {number} rssi - The RSSI value
	 * @returns {Object} The result of the insert operation
	 */
	insert(mac, name, rssi = -70) {
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
		return this.statements.update.run(name, rssi, mac);
	}

	/**
	 * Update a device's paired status
	 * @param {string} mac - The MAC address
	 * @param {boolean} paired - The paired status
	 * @returns {Object} The result of the update operation
	 */
	updatePaired(mac, paired) {
		return this.statements.updatePaired.run(paired ? 1 : 0, mac);
	}

	/**
	 * Update a device's trusted status
	 * @param {string} mac - The MAC address
	 * @param {boolean} trusted - The trusted status
	 * @returns {Object} The result of the update operation
	 */
	updateTrusted(mac, trusted) {
		return this.statements.updateTrusted.run(trusted ? 1 : 0, mac);
	}
}

module.exports = Device;
