import type { ArState } from './ar-state.js';
import type { WorkspaceMode } from '../../registration/registration-store.js';
import {
	DISPLAY_MODE_OPTIONS,
	getDisplayModeLabel
} from '../../shared/display-modes.js';

export { DISPLAY_MODE_OPTIONS, getDisplayModeLabel };

export const PANEL_OPTIONS: Array<{ value: WorkspaceMode; label: string; short: string }> = [
	{ value: 'browse', label: '浏览', short: '览' },
	{ value: 'registration', label: '配准', short: '准' },
	{ value: 'tools', label: '工具', short: '工' },
	{ value: 'inspection', label: '核查', short: '查' }
];

export function getWorkspaceLabel(mode: WorkspaceMode): string {

	return PANEL_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '浏览';

}

export function getPhaseLabel(phase: ArState['engine']['arSessionPhase']): string {

	switch ( phase ) {
		case 'scanning':
			return '扫描中';
		case 'ready-to-place':
			return '可放置';
		case 'placing':
			return '放置中';
		case 'placed':
			return '已放置';
	}

}

export function getSupportLabel(state: ArState['engine']['arSupportState']): string {

	switch ( state ) {
		case 'checking':
			return '检测中';
		case 'supported':
			return '支持 AR';
		case 'unsupported':
			return '不支持 AR';
	}

}

export function getGuidanceContent(
	phase: ArState['engine']['arSessionPhase']
): { title: string; body: string } {

	if ( phase === 'ready-to-place' ) {
		return {
			title: '已识别到平面',
			body: '确认目标位置稳定后，点击开始放置模型。'
		};
	}

	if ( phase === 'placing' ) {
		return {
			title: '正在放置模型',
			body: '系统正在结合 hit-test 与粗配准结果生成初始位置。'
		};
	}

	return {
		title: '正在识别平面',
		body: '缓慢移动手机，让地面或墙面持续出现在画面中。'
	};

}
