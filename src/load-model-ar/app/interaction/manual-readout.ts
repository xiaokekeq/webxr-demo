import { formatManualPositionSummary, normalizeSignedDegrees } from '../runtime/formatters.js';
import type {
	RegistrationStore
} from '../../data/registration-store.js';
import type { ManualRegistrationState } from '../../registration/manual-registration.js';

interface CreateManualReadoutSyncOptions {
	store: RegistrationStore;
}

export interface ManualReadoutSync {
	update(state: ManualRegistrationState): void;
}

export function createManualReadoutSync(options: CreateManualReadoutSyncOptions): ManualReadoutSync {

	const { store } = options;

	return {
		update(state) {

			store.patch( {
				manualReadout: {
					positionText: formatManualPositionSummary( state.offset ),
					yawText: `${normalizeSignedDegrees( state.yawDeg ).toFixed( 0 )}deg`,
					scaleText: `${state.scaleMultiplier.toFixed( 3 )}x`
				}
			} );

		}
	};

}
