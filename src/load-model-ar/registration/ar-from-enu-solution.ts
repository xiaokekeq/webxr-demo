import * as THREE from 'three';
import type { SavedMarkerLocalizationResult } from './marker-localization-storage.js';

export type ArLocalizationSource =
	| 'gps-imu'
	| 'manual-site-pose'
	| 'marker'
	| 'rtk'
	| 'vps'
	| 'unknown';

export interface ArFromEnuSolution {
	matrix: THREE.Matrix4;
	siteOriginArPosition: THREE.Vector3;
	orientation: THREE.Quaternion;
	headingDeg: number;
	source: ArLocalizationSource;
	sessionId?: string | null;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp: number;
}

export function createArFromEnuSolution(args: {
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	headingDeg: number;
	source?: ArLocalizationSource;
	sessionId?: string | null;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp?: number;
}): ArFromEnuSolution {

	const position = args.position.clone();
	const orientation = args.orientation.clone();
	const matrix = new THREE.Matrix4().compose(
		position.clone(),
		orientation.clone(),
		new THREE.Vector3( 1, 1, 1 )
	);

	return {
		matrix,
		siteOriginArPosition: position,
		orientation,
		headingDeg: args.headingDeg,
		source: args.source ?? 'gps-imu',
		sessionId: args.sessionId ?? null,
		accuracyMeters: args.accuracyMeters,
		yawAccuracyDegrees: args.yawAccuracyDegrees,
		timestamp: args.timestamp ?? Date.now()
	};

}

const tempMarkerPosition = new THREE.Vector3();
const tempMarkerOrientation = new THREE.Quaternion();
const tempMarkerScale = new THREE.Vector3();
const tempNorthInAr = new THREE.Vector3();

export function createArFromEnuSolutionFromSavedMarkerResult(
	saved: SavedMarkerLocalizationResult
): ArFromEnuSolution {

	const matrix = toMatrix4( saved.matrix );
	matrix.decompose(
		tempMarkerPosition,
		tempMarkerOrientation,
		tempMarkerScale
	);

	const siteOriginArPosition = saved.siteOriginArPosition === undefined
		? tempMarkerPosition.clone()
		: new THREE.Vector3(
			saved.siteOriginArPosition.x,
			saved.siteOriginArPosition.y,
			saved.siteOriginArPosition.z
		);
	const orientation = tempMarkerOrientation.clone();

	return {
		matrix,
		siteOriginArPosition,
		orientation,
		headingDeg: saved.headingDeg ?? extractHeadingDegFromEnuToArOrientation( orientation ),
		source: 'marker',
		sessionId: null,
		accuracyMeters: saved.rmsErrorMeters,
		timestamp: saved.timestamp
	};

}

function extractHeadingDegFromEnuToArOrientation(orientation: THREE.Quaternion): number {

	tempNorthInAr.set( 0, 1, 0 ).applyQuaternion( orientation );
	return normalizeDegrees(
		THREE.MathUtils.radToDeg( Math.atan2( - tempNorthInAr.x, - tempNorthInAr.z ) )
	);

}

function toMatrix4(value: number[] | THREE.Matrix4): THREE.Matrix4 {

	if ( value instanceof THREE.Matrix4 ) {
		return value.clone();
	}

	return new THREE.Matrix4().fromArray( value );

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}
