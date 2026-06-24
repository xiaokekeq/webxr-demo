import * as THREE from 'three';

export function formatManualPositionSummary(offset: THREE.Vector3): string {

	const xLabel = offset.x >= 0 ? '右移' : '左移';
	const yLabel = offset.y >= 0 ? '上移' : '下移';
	const zLabel = offset.z <= 0 ? '前移' : '后移';

	return `${xLabel} ${Math.abs( offset.x ).toFixed( 2 )}m / ${yLabel} ${Math.abs( offset.y ).toFixed( 2 )}m / ${zLabel} ${Math.abs( offset.z ).toFixed( 2 )}m`;

}

export function formatGeodetic(lat: number, lon: number, alt: number): string {

	return `${lat.toFixed( 6 )}, ${lon.toFixed( 6 )}, ${alt.toFixed( 2 )}m`;

}

export function formatVector3(vector: THREE.Vector3): string {

	return `(${vector.x.toFixed( 3 )}, ${vector.y.toFixed( 3 )}, ${vector.z.toFixed( 3 )})`;

}

export function formatQuaternion(quaternion: THREE.Quaternion): string {

	return `(${quaternion.x.toFixed( 3 )}, ${quaternion.y.toFixed( 3 )}, ${quaternion.z.toFixed( 3 )}, ${quaternion.w.toFixed( 3 )})`;

}

export function vectorToPlainObject(vector: THREE.Vector3): { x: number; y: number; z: number } {

	return {
		x: Number( vector.x.toFixed( 6 ) ),
		y: Number( vector.y.toFixed( 6 ) ),
		z: Number( vector.z.toFixed( 6 ) )
	};

}

export function quaternionToPlainObject(quaternion: THREE.Quaternion): {
	x: number;
	y: number;
	z: number;
	w: number;
} {

	return {
		x: Number( quaternion.x.toFixed( 6 ) ),
		y: Number( quaternion.y.toFixed( 6 ) ),
		z: Number( quaternion.z.toFixed( 6 ) ),
		w: Number( quaternion.w.toFixed( 6 ) )
	};

}

export function normalizeSignedDegrees(value: number): number {

	return value > 180 ? value - 360 : value;

}

export function getTimeLabel(): string {

	const now = new Date();
	return now.toLocaleTimeString( 'zh-CN', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	} );

}
