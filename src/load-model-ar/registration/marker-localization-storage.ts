import * as THREE from 'three';

export const MARKER_LOCALIZATION_STORAGE_KEY = 'loadModelAR.markerLocalization.lastStableSolution';

export interface SavedMarkerLocalizationResult {
	markerId: string;
	markerConfigId?: string;
	timestamp: number;
	source: 'marker';
	matrix: number[] | THREE.Matrix4;
	siteOriginArPosition?: {
		x: number;
		y: number;
		z: number;
	};
	headingDeg?: number;
	rmsErrorMeters?: number;
	sampleCount?: number;
	stabilityReport?: unknown;
}

export function loadLastStableMarkerLocalizationResult(): SavedMarkerLocalizationResult | null {

	if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
		return null;
	}

	let raw: string | null = null;

	try {
		raw = window.localStorage.getItem( MARKER_LOCALIZATION_STORAGE_KEY );
	} catch ( error ) {
		console.warn( 'Failed to read marker localization result from localStorage:', error );
		return null;
	}

	if ( raw === null ) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse( raw );
	} catch ( error ) {
		console.warn( 'Failed to parse saved marker localization result JSON:', error );
		return null;
	}

	if ( isSavedMarkerLocalizationResultValid( parsed ) === false ) {
		return null;
	}

	return {
		...parsed,
		matrix: toMatrix4( parsed.matrix )
	};

}

export function clearLastStableMarkerLocalizationResult(): boolean {

	if ( typeof window === 'undefined' || typeof window.localStorage === 'undefined' ) {
		return false;
	}

	try {
		window.localStorage.removeItem( MARKER_LOCALIZATION_STORAGE_KEY );
		return true;
	} catch ( error ) {
		console.warn( 'Failed to clear saved marker localization result:', error );
		return false;
	}

}

export function isSavedMarkerLocalizationResultValid(
	value: unknown
): value is SavedMarkerLocalizationResult {

	if ( typeof value !== 'object' || value === null ) {
		return false;
	}

	const candidate = value as Partial<SavedMarkerLocalizationResult>;

	if ( typeof candidate.markerId !== 'string' || candidate.markerId.trim().length === 0 ) {
		return false;
	}

	if ( candidate.markerConfigId !== undefined && typeof candidate.markerConfigId !== 'string' ) {
		return false;
	}

	if ( candidate.source !== 'marker' ) {
		return false;
	}

	if ( typeof candidate.timestamp !== 'number' || Number.isFinite( candidate.timestamp ) === false ) {
		return false;
	}

	if ( isMatrixLike( candidate.matrix ) === false ) {
		return false;
	}

	if ( candidate.siteOriginArPosition !== undefined ) {
		const position = candidate.siteOriginArPosition;
		if (
			typeof position !== 'object'
			|| position === null
			|| typeof position.x !== 'number'
			|| Number.isFinite( position.x ) === false
			|| typeof position.y !== 'number'
			|| Number.isFinite( position.y ) === false
			|| typeof position.z !== 'number'
			|| Number.isFinite( position.z ) === false
		) {
			return false;
		}
	}

	if ( candidate.headingDeg !== undefined && ( typeof candidate.headingDeg !== 'number' || Number.isFinite( candidate.headingDeg ) === false ) ) {
		return false;
	}

	if ( candidate.rmsErrorMeters !== undefined && ( typeof candidate.rmsErrorMeters !== 'number' || Number.isFinite( candidate.rmsErrorMeters ) === false ) ) {
		return false;
	}

	if ( candidate.sampleCount !== undefined && ( typeof candidate.sampleCount !== 'number' || Number.isFinite( candidate.sampleCount ) === false ) ) {
		return false;
	}

	return true;

}

function isMatrixLike(value: unknown): value is number[] | THREE.Matrix4 {

	if ( value instanceof THREE.Matrix4 ) {
		return true;
	}

	return Array.isArray( value )
		&& value.length === 16
		&& value.every( ( entry ) => typeof entry === 'number' && Number.isFinite( entry ) );

}

function toMatrix4(value: number[] | THREE.Matrix4): THREE.Matrix4 {

	if ( value instanceof THREE.Matrix4 ) {
		return value.clone();
	}

	return new THREE.Matrix4().fromArray( value );

}
