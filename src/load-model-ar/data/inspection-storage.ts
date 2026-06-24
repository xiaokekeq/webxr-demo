const STORAGE_KEY = 'load-model-ar-inspection-records';

export function loadInspectionRecords(): string[] {

	try {
		const raw = window.localStorage.getItem( STORAGE_KEY );
		if ( raw === null ) {
			return [];
		}

		const parsed = JSON.parse( raw );
		return Array.isArray( parsed ) ? parsed.filter( ( item ): item is string => typeof item === 'string' ) : [];
	} catch {
		return [];
	}

}

export function saveInspectionRecords(records: string[]): void {

	window.localStorage.setItem( STORAGE_KEY, JSON.stringify( records ) );

}
