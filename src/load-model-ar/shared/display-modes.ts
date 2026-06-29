import type {
	ArDisplayMode,
	SectionCutPlaneMode
} from '../registration/registration-store.js';

export const DISPLAY_MODE_OPTIONS: Array<{
	value: ArDisplayMode;
	label: string;
	disabled?: boolean;
}> = [
	{ value: 'solid-overlay', label: '普通叠加' },
	{ value: 'transparent-xray', label: '透明透视' },
	{ value: 'layer-peeling', label: '层级剥离' },
	{ value: 'section-cut', label: '剖切查看' }
];

export const SECTION_CUT_PLANE_MODE_OPTIONS: Array<{
	value: SectionCutPlaneMode;
	label: string;
}> = [
	{ value: 'horizontal-section', label: '水平剖切' },
	{ value: 'cross-section', label: '横断面' },
	{ value: 'longitudinal-section', label: '纵断面' }
];

export function getDisplayModeLabel(mode: ArDisplayMode): string {

	return DISPLAY_MODE_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '普通叠加';

}

export function getDisplayModeSliderLabel(mode: ArDisplayMode): string | null {

	switch ( mode ) {
		case 'transparent-xray':
			return '透视强度';
		case 'layer-peeling':
			return '剥离进度';
		case 'section-cut':
			return '剖切位置';
		default:
			return null;
	}

}

export function getDisplayModeSliderValueText(
	mode: ArDisplayMode,
	value: number
): string {

	const label = getDisplayModeSliderLabel( mode );
	return label === null
		? `${value}%`
		: `${label} ${value}%`;

}

export function getSectionCutPlaneModeLabel(mode: SectionCutPlaneMode): string {

	return SECTION_CUT_PLANE_MODE_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '水平剖切';

}
