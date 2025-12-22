/**
 * BluetoothDeviceModal Component
 * Modal for managing a paired/connected Bluetooth device
 * Supports "Forget Device" action to unpair a device
 */

import { useState, useEffect } from 'react';
import { Modal, Stack, Button, Text } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useLocation } from 'react-router-dom';
import { removeDevice } from '../services';
import type { BluetoothDevice } from '../services';

interface BluetoothDeviceModalProps {
	device: BluetoothDevice;
	opened: boolean;
	onClose: () => void;
}

function BluetoothDeviceModal({ device, opened, onClose }: BluetoothDeviceModalProps) {
	const [isRemoving, setIsRemoving] = useState(false);
	const location = useLocation();

	// Handle browser back button to close modal
	useEffect(() => {
		const handlePopState = () => {
			if (opened) {
				onClose();
			}
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, [opened, onClose]);

	const handleModalClose = () => {
		onClose();
		// Go back if we pushed a state
		if (window.history.state !== null) {
			window.history.back();
		}
	};

	const handleForgetDevice = async () => {
		setIsRemoving(true);
		try {
			await removeDevice(device.mac);

			notifications.show({
				color: 'teal',
				message: `Removed "${device.name}"`,
				position: 'top-right',
				autoClose: 1200
			});
			handleModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to remove device',
				position: 'top-right',
				autoClose: 3000
			});
			handleModalClose();
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<Modal
			opened={opened}
			onClose={handleModalClose}
			withCloseButton={false}
			size="sm"
			centered
			overlayProps={{
				blur: 5
			}}
			onClick={(e) => e.stopPropagation()}
		>
			<Stack gap="md">
				{/* Header */}
				<Text fw={600} size="lg" lineClamp={2}>
					{device.name}
				</Text>

				{/* Action Button */}
				<Button
					variant="light"
					color="red"
					leftSection={<Trash2 size={16} />}
					onClick={handleForgetDevice}
					loading={isRemoving}
					fullWidth
				>
					Forget Device
				</Button>
			</Stack>
		</Modal>
	);
}

export default BluetoothDeviceModal;
