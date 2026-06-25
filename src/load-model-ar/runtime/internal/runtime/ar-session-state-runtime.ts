import type {
	ArSessionPhase,
	RegistrationStore
} from '../../../registration/registration-store.js';

interface CreateArSessionStateRuntimeOptions {
	store: RegistrationStore;
	isPresenting(): boolean;
	hasGroundHit(): boolean;
	hasPlacedModel(): boolean;
	isCoarsePlacementPending(): boolean;
}

export interface ArSessionStateRuntime {
	handleSessionStart(): void;
	handleSessionEnd(): void;
	syncPhase(): void;
	markPlacementCommitted(committed?: boolean): void;
}

export function createArSessionStateRuntime(
	options: CreateArSessionStateRuntimeOptions
): ArSessionStateRuntime {

	const {
		store,
		isPresenting,
		hasGroundHit,
		hasPlacedModel,
		isCoarsePlacementPending
	} = options;

	let hasCommittedPlacement = false;

	return {
		handleSessionStart() {

			hasCommittedPlacement = false;
			store.patch( {
				appMode: 'ar-session',
				arSessionPhase: 'scanning',
				workspaceMode: 'registration',
				registrationStatusDetail: '状态：扫描平面中'
			} );

		},

		handleSessionEnd() {

			hasCommittedPlacement = false;
			store.patch( {
				appMode: 'pre-ar',
				arSessionPhase: 'scanning',
				workspaceMode: 'browse',
				registrationStatusDetail: '状态：等待识别平面'
			} );

		},

		syncPhase() {

			if ( isPresenting() === false ) {
				hasCommittedPlacement = false;
				patchPhase( 'scanning' );
				return;
			}

			if ( isCoarsePlacementPending() ) {
				patchPhase( 'placing' );
				return;
			}

			if ( hasCommittedPlacement || hasPlacedModel() ) {
				hasCommittedPlacement = hasPlacedModel();
				patchPhase( 'placed' );
				return;
			}

			if ( hasGroundHit() ) {
				patchPhase( 'ready-to-place' );
				return;
			}

			patchPhase( 'scanning' );

		},

		markPlacementCommitted(committed = true) {

			hasCommittedPlacement = committed;

		}
	};

	function patchPhase(nextPhase: ArSessionPhase): void {

		if ( store.getState().arSessionPhase === nextPhase ) {
			return;
		}

		store.patch( { arSessionPhase: nextPhase } );

		switch ( nextPhase ) {
			case 'scanning':
				store.patch( { registrationStatusDetail: '状态：扫描平面中' } );
				break;
			case 'ready-to-place':
				store.patch( { registrationStatusDetail: '状态：已识别平面，可开始放置' } );
				break;
			case 'placing':
				store.patch( { registrationStatusDetail: '状态：正在放置模型' } );
				break;
			case 'placed':
				store.patch( { registrationStatusDetail: '状态：模型已放置' } );
				break;
		}

	}

}
