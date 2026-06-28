import type { ArDisplayMode } from '../registration/registration-store.js';

export const DISPLAY_MODE_OPTIONS: Array<{ value: ArDisplayMode; label: string; disabled?: boolean }> = [
	{ value: 'solid-overlay', label: '普通叠加' },
	{ value: 'transparent-xray', label: '透明透视' },
	{ value: 'spatial-reveal', label: '空间显现' },
	{ value: 'layer-peeling', label: '层级剥离' },
	{ value: 'section-cut', label: '剖切查看' }
];

export function getDisplayModeLabel(mode: ArDisplayMode): string {

	return DISPLAY_MODE_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '普通叠加';

}
