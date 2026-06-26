import type { DisplayMode } from '../registration/registration-store.js';

export const DISPLAY_MODE_OPTIONS: Array<{ value: DisplayMode; label: string }> = [
	{ value: 'normal', label: '普通叠加' },
	{ value: 'xray', label: '透视核查' },
	{ value: 'occlusion-outline', label: '遮挡辅助' }
];

export function getDisplayModeLabel(mode: DisplayMode): string {

	return DISPLAY_MODE_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '普通叠加';

}
