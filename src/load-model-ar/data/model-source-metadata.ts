import * as THREE from 'three';

export interface EmbeddedGeoOriginCandidate {
	lat: number;
	lon: number;
	alt: number | null;
	coordType: string | null;
	sourcePath: string;
}

export interface ModelSourceMetadata {
	format: 'gltf' | 'obj' | 'fbx';
	originalName: string | null;
	unitScaleFactor: number | null;
	rootTranslation: {
		x: number;
		y: number;
		z: number;
	} | null;
	embeddedGeoOrigin: EmbeddedGeoOriginCandidate | null;
}

const SOURCE_METADATA_KEY = '__sourceMetadata';

export function extractModelSourceMetadata(
	source: THREE.Object3D,
	format: ModelSourceMetadata['format']
): ModelSourceMetadata {

	return {
		format,
		originalName: readOriginalName( source ),
		unitScaleFactor: readUnitScaleFactor( source ),
		rootTranslation: readRootTranslation( source ),
		embeddedGeoOrigin: findEmbeddedGeoOrigin( source )
	};

}

export function attachModelSourceMetadata(
	target: THREE.Object3D,
	metadata: ModelSourceMetadata
): void {

	target.userData[ SOURCE_METADATA_KEY ] = metadata;

}

export function readModelSourceMetadata(target: THREE.Object3D): ModelSourceMetadata | null {

	const metadata = target.userData[ SOURCE_METADATA_KEY ];
	return isModelSourceMetadata( metadata ) ? metadata : null;

}

function readOriginalName(source: THREE.Object3D): string | null {

	const userDataName = typeof source.userData.originalName === 'string'
		? source.userData.originalName
		: null;
	const runtimeName = source.name.trim().length > 0 ? source.name : null;

	return userDataName ?? runtimeName;

}

function readUnitScaleFactor(source: THREE.Object3D): number | null {

	const value = source.userData.unitScaleFactor;
	return typeof value === 'number' && Number.isFinite( value ) ? value : null;

}

function readRootTranslation(source: THREE.Object3D): {
	x: number;
	y: number;
	z: number;
} | null {

	const transformData = source.userData.transformData;
	if ( typeof transformData !== 'object' || transformData === null ) {
		return null;
	}

	const translation = ( transformData as { translation?: unknown } ).translation;
	if ( Array.isArray( translation ) === false || translation.length < 3 ) {
		return null;
	}

	const [ x, y, z ] = translation;
	if ( [ x, y, z ].some( ( value ) => typeof value !== 'number' || Number.isFinite( value ) === false ) ) {
		return null;
	}

	return { x, y, z };

}

function findEmbeddedGeoOrigin(source: THREE.Object3D): EmbeddedGeoOriginCandidate | null {

	let bestCandidate: EmbeddedGeoOriginCandidate | null = null;
	source.traverse( ( node ) => {
		if ( bestCandidate !== null ) {
			return;
		}

		bestCandidate = readGeoOriginCandidateFromNode( node );
	} );

	return bestCandidate;

}

function readGeoOriginCandidateFromNode(node: THREE.Object3D): EmbeddedGeoOriginCandidate | null {

	const userData = node.userData;
	if ( typeof userData !== 'object' || userData === null ) {
		return null;
	}

	const lat = pickNumericValue( userData, [ 'lat', 'latitude' ] );
	const lon = pickNumericValue( userData, [ 'lon', 'lng', 'longitude' ] );
	if ( lat === null || lon === null ) {
		return null;
	}

	return {
		lat,
		lon,
		alt: pickNumericValue( userData, [ 'alt', 'altitude', 'height' ] ),
		coordType: pickStringValue( userData, [ 'coordType', 'coordinateType', 'crs', 'epsg' ] ),
		sourcePath: buildNodePath( node )
	};

}

function pickNumericValue(record: Record<string, unknown>, keys: string[]): number | null {

	for ( const key of keys ) {
		const value = record[ key ];
		if ( typeof value === 'number' && Number.isFinite( value ) ) {
			return value;
		}
	}

	return null;

}

function pickStringValue(record: Record<string, unknown>, keys: string[]): string | null {

	for ( const key of keys ) {
		const value = record[ key ];
		if ( typeof value === 'string' && value.trim().length > 0 ) {
			return value;
		}
	}

	return null;

}

function buildNodePath(node: THREE.Object3D): string {

	const parts: string[] = [];
	let current: THREE.Object3D | null = node;

	while ( current !== null ) {
		const name = current.name || current.userData.originalName || current.type;
		parts.push( String( name ) );
		current = current.parent;
	}

	return parts.reverse().join( '/' );

}

function isModelSourceMetadata(value: unknown): value is ModelSourceMetadata {

	if ( typeof value !== 'object' || value === null ) {
		return false;
	}

	const candidate = value as Partial<ModelSourceMetadata>;
	return candidate.format === 'gltf'
		|| candidate.format === 'obj'
		|| candidate.format === 'fbx';

}
