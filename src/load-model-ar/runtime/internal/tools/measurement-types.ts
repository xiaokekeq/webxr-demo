import * as THREE from 'three';
import type { MeasurementMode } from '../../../registration/registration-store.js';

export interface MeasurementModeOption {
	mode: MeasurementMode;
	label: string;
	description: string;
}

export interface MeasurementComputation {
	resultText: string;
	detailText: string;
}

export const MEASUREMENT_MODE_OPTIONS: MeasurementModeOption[] = [
	{
		mode: 'distance-3d',
		label: '两点测距',
		description: '计算两个测点之间的空间直线距离。'
	},
	{
		mode: 'distance-horizontal',
		label: '水平距离',
		description: '计算两个测点在水平面上的投影距离。'
	},
	{
		mode: 'depth',
		label: '深入测量',
		description: '计算两个测点之间的竖向深度差。'
	}
];

export function getMeasurementModeLabel(mode: MeasurementMode): string {

	return MEASUREMENT_MODE_OPTIONS.find( ( item ) => item.mode === mode )?.label ?? '测量';

}

export function getMeasurementModeDescription(mode: MeasurementMode): string {

	return MEASUREMENT_MODE_OPTIONS.find( ( item ) => item.mode === mode )?.description ?? '请选择一种测量模式。';

}

export function computeMeasurementResult(
	mode: MeasurementMode,
	points: THREE.Vector3[]
): MeasurementComputation {

	const [ startPoint, endPoint ] = points;
	const deltaX = endPoint.x - startPoint.x;
	const deltaY = endPoint.y - startPoint.y;
	const deltaZ = endPoint.z - startPoint.z;
	const horizontalDistance = Math.hypot( deltaX, deltaZ );
	const spatialDistance = startPoint.distanceTo( endPoint );
	const verticalDistance = Math.abs( deltaY );

	switch ( mode ) {
		case 'distance-3d':
			return {
				resultText: formatMeters( spatialDistance ),
				detailText: `空间直线距离，水平 ${formatMeters( horizontalDistance )} / 竖向 ${formatMeters( verticalDistance )}`
			};
		case 'distance-horizontal':
			return {
				resultText: formatMeters( horizontalDistance ),
				detailText: `水平投影距离，竖向差 ${formatMeters( verticalDistance )}`
			};
		case 'depth':
			return {
				resultText: formatMeters( verticalDistance ),
				detailText: deltaY < 0
					? `第二点相对第一点更深 ${formatMeters( verticalDistance )}`
					: deltaY > 0
						? `第二点相对第一点更高 ${formatMeters( verticalDistance )}`
						: '两个测点处于同一高度'
			};
	}

}

function formatMeters(value: number): string {

	return `${value.toFixed( 3 )}m`;

}
