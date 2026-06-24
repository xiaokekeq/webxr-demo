import { getTimeLabel } from '../../../shared/formatters.js';
import type { RegistrationStore } from '../../../registration/registration-store.js';
import type { SetStatus } from '../../../shared/types.js';

interface CreateStatusRuntimeOptions {
	store: RegistrationStore;
	updateStatusText: SetStatus;
	maxLogItems: number;
}

export interface StatusRuntime {
	setStatus(message: string): void;
	appendLog(message: string): void;
	updateRegistrationStatusDetail(message: string): void;
}

export function createStatusRuntime(options: CreateStatusRuntimeOptions): StatusRuntime {

	const { store, updateStatusText, maxLogItems } = options;

	function appendLog(message: string): void {

		const currentLogs = store.getState().logMessages;
		if ( currentLogs[ 0 ]?.endsWith( message ) ) {
			return;
		}

		store.patch( {
			logMessages: [ `[${getTimeLabel()}] ${message}`, ...currentLogs ].slice( 0, maxLogItems )
		} );

	}

	return {
		setStatus(message) {

			updateStatusText( message );
			store.patch( { runtimeStatus: message } );
			appendLog( message );

		},

		appendLog,

		updateRegistrationStatusDetail(message) {

			store.patch( { registrationStatusDetail: message } );

		}
	};

}




