import * as THREE from 'three';

export interface SerializedPrecisionRegistrationResult {
	modelId: string;
	deltaTransform: {
		position: [ number, number, number ];
		quaternion: [ number, number, number, number ];
		scale: number;
	};
	rmsErrorMeters: number;
	pairCount: number;
	sourcePointIds: string[];
	updatedAt: string;
}

export interface PrecisionRegistrationResult {
	modelId: string;
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	scale: number;
	rmsErrorMeters: number;
	pairCount: number;
	sourcePointIds: string[];
	updatedAt: string;
}

const STORAGE_KEY_PREFIX = 'webxr-precision-registration:';

export function savePrecisionRegistrationResult(result: PrecisionRegistrationResult): void {

	localStorage.setItem(
		getStorageKey( result.modelId ),
		JSON.stringify( serializePrecisionRegistrationResult( result ) )
	);

}

export function loadPrecisionRegistrationResult(modelId: string): PrecisionRegistrationResult | null {

	const raw = localStorage.getItem( getStorageKey( modelId ) );
	if ( raw === null ) {
		return null;
	}

	try {
		return deserializePrecisionRegistrationResult(
			JSON.parse( raw ) as Partial<SerializedPrecisionRegistrationResult>
		);
	} catch ( error ) {
		console.error( 'Failed to load precision registration result:', error );
		return null;
	}

}

export function clearPrecisionRegistrationResult(modelId: string): void {

	localStorage.removeItem( getStorageKey( modelId ) );

}

function serializePrecisionRegistrationResult(
	result: PrecisionRegistrationResult
): SerializedPrecisionRegistrationResult {

	return {
		modelId: result.modelId,
		deltaTransform: {
			position: result.position.toArray() as [ number, number, number ],
			quaternion: [
				result.quaternion.x,
				result.quaternion.y,
				result.quaternion.z,
				result.quaternion.w
			],
			scale: result.scale
		},
		rmsErrorMeters: result.rmsErrorMeters,
		pairCount: result.pairCount,
		sourcePointIds: result.sourcePointIds,
		updatedAt: result.updatedAt
	};

}

function deserializePrecisionRegistrationResult(
	raw: Partial<SerializedPrecisionRegistrationResult>
): PrecisionRegistrationResult | null {

	if (
		typeof raw.modelId !== 'string'
		|| raw.deltaTransform === undefined
		|| Array.isArray( raw.deltaTransform.position ) === false
		|| Array.isArray( raw.deltaTransform.quaternion ) === false
		|| typeof raw.deltaTransform.scale !== 'number'
	) {
		return null;
	}

	return {
		modelId: raw.modelId,
		position: new THREE.Vector3().fromArray( raw.deltaTransform.position ),
		quaternion: new THREE.Quaternion().fromArray( raw.deltaTransform.quaternion ),
		scale: raw.deltaTransform.scale,
		rmsErrorMeters: typeof raw.rmsErrorMeters === 'number' ? raw.rmsErrorMeters : Number.NaN,
		pairCount: typeof raw.pairCount === 'number' ? raw.pairCount : 0,
		sourcePointIds: Array.isArray( raw.sourcePointIds ) ? raw.sourcePointIds : [],
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
	};

}

function getStorageKey(modelId: string): string {

	return `${STORAGE_KEY_PREFIX}${modelId}`;

}
