export interface SerializedManualRegistrationState {
	offsetX: number;
	offsetY: number;
	offsetZ: number;
	yawDeg: number;
	scaleMultiplier: number;
}

const STORAGE_KEY_PREFIX = 'webxr-manual-registration:';

export function saveManualRegistrationState(
	modelId: string,
	state: SerializedManualRegistrationState
): boolean {

	try {
		localStorage.setItem( getStorageKey( modelId ), JSON.stringify( state ) );
		return true;
	} catch ( error ) {
		console.error( 'Failed to save manual registration:', error );
		return false;
	}

}

export function loadManualRegistrationState(
	modelId: string
): SerializedManualRegistrationState | null {

	try {
		const raw = localStorage.getItem( getStorageKey( modelId ) );
		if ( raw === null ) {
			return null;
		}

		const parsed = JSON.parse( raw ) as Partial<SerializedManualRegistrationState>;
		return {
			offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : 0,
			offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : 0,
			offsetZ: typeof parsed.offsetZ === 'number' ? parsed.offsetZ : 0,
			yawDeg: typeof parsed.yawDeg === 'number' ? parsed.yawDeg : 0,
			scaleMultiplier: typeof parsed.scaleMultiplier === 'number' ? parsed.scaleMultiplier : 1
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
