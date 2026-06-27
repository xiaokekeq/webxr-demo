export interface SerializedResolvedManualRegistrationState {
	version: 2;
	rootSiteEnuX: number;
	rootSiteEnuY: number;
	rootSiteEnuZ: number;
	rootWorldLat: number;
	rootWorldLon: number;
	rootWorldAlt: number;
	rootYawDeg: number;
	scaleMultiplier: number;
	updatedAt: string;
}

const STORAGE_KEY_PREFIX = 'webxr-manual-registration:';

export function saveResolvedManualRegistrationState(
	modelId: string,
	state: SerializedResolvedManualRegistrationState
): boolean {

	try {
		localStorage.setItem( getStorageKey( modelId ), JSON.stringify( state ) );
		return true;
	} catch ( error ) {
		console.error( 'Failed to save manual registration:', error );
		return false;
	}

}

export function loadResolvedManualRegistrationState(
	modelId: string
): SerializedResolvedManualRegistrationState | null {

	try {
		const storageKey = getStorageKey( modelId );
		const raw = localStorage.getItem( storageKey );
		if ( raw === null ) {
			return null;
		}

		const parsed = JSON.parse( raw ) as Partial<SerializedResolvedManualRegistrationState>;
		if ( parsed.version !== 2 ) {
			localStorage.removeItem( storageKey );
			return null;
		}

		return {
			version: 2,
			rootSiteEnuX: toFiniteNumber( parsed.rootSiteEnuX, 0 ),
			rootSiteEnuY: toFiniteNumber( parsed.rootSiteEnuY, 0 ),
			rootSiteEnuZ: toFiniteNumber( parsed.rootSiteEnuZ, 0 ),
			rootWorldLat: toFiniteNumber( parsed.rootWorldLat, 0 ),
			rootWorldLon: toFiniteNumber( parsed.rootWorldLon, 0 ),
			rootWorldAlt: toFiniteNumber( parsed.rootWorldAlt, 0 ),
			rootYawDeg: toFiniteNumber( parsed.rootYawDeg, 0 ),
			scaleMultiplier: toFiniteNumber( parsed.scaleMultiplier, 1 ),
			updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
		};
	} catch ( error ) {
		console.error( 'Failed to load manual registration:', error );
		return null;
	}

}

export function clearManualRegistrationState(modelId: string): boolean {

	try {
		localStorage.removeItem( getStorageKey( modelId ) );
		return true;
	} catch ( error ) {
		console.error( 'Failed to clear saved manual registration:', error );
		return false;
	}

}

function getStorageKey(modelId: string): string {

	return `${STORAGE_KEY_PREFIX}${modelId}`;

}

function toFiniteNumber(value: unknown, fallback: number): number {

	return typeof value === 'number' && Number.isFinite( value ) ? value : fallback;

}
