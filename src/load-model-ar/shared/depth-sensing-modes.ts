import type { DepthSensingMode } from '../registration/registration-store.js';

export const DEPTH_SENSING_MODE_OPTIONS: Array<{ value: DepthSensingMode; label: string }> = [
	{ value: 'disabled', label: '关闭' },
	{ value: 'gpu', label: '仅 GPU' },
	{ value: 'cpu', label: '仅 CPU' },
	{ value: 'auto', label: '自动' }
];

export function getDepthSensingModeLabel(mode: DepthSensingMode): string {

	switch ( mode ) {
		case 'disabled':
			return '关闭';
		case 'gpu':
			return '仅 GPU';
		case 'cpu':
			return '仅 CPU';
		case 'auto':
			return '自动';
	}

}
