import * as THREE from 'three';
import {
	createDefaultPrecisionRegistrationState,
	type RegistrationStore
} from '../data/registration-store.js';
import type { EngineeringControlPoint } from './engineering-registration.js';
import { solveSimilarityTransform } from './engineering-registration.js';
import {
	clearPrecisionRegistrationResult,
	loadPrecisionRegistrationResult,
	savePrecisionRegistrationResult,
	type PrecisionRegistrationResult
} from './precision-registration-storage.js';

interface CreatePrecisionRegistrationControllerOptions {
	store: RegistrationStore;
	setStatus(message: string): void;
	getPlacedModel(): THREE.Group | null;
	getCurrentModelId(): string | null;
	getTargetPoint(target: THREE.Vector3): THREE.Vector3 | null;
	onApplied?(): void;
}

interface PrecisionPair {
	sourcePointId: string;
	sourceModelLocal: THREE.Vector3;
	targetAr: THREE.Vector3;
}

export interface PrecisionRegistrationController {
	handleSourceSelection(sourcePoint: string): void;
	armSourcePoint(): void;
	confirmTargetPoint(): void;
	addPair(): void;
	solve(): void;
	save(): void;
	clear(): void;
	clearSaved(modelId: string): void;
	loadSavedResult(modelId: string): void;
	applySavedResult(placedModel: THREE.Group | null): boolean;
	updateSourcePointOptions(sourcePoints: EngineeringControlPoint[]): void;
}

const MIN_SOLVE_PAIR_COUNT = 3;
const tempTargetPoint = new THREE.Vector3();
const tempSourcePoint = new THREE.Vector3();
const tempDeltaScale = new THREE.Vector3();
const tempParentInverse = new THREE.Matrix4();
const tempNextWorldMatrix = new THREE.Matrix4();
const tempNextLocalMatrix = new THREE.Matrix4();
export function createPrecisionRegistrationController(
	options: CreatePrecisionRegistrationControllerOptions
): PrecisionRegistrationController {

	const {
		store,
		setStatus,
		getPlacedModel,
		getCurrentModelId,
		getTargetPoint,
		onApplied
	} = options;

	const sourcePointsById = new Map<string, EngineeringControlPoint>();
	const pairs: PrecisionPair[] = [];
	let appliedModels = new WeakSet<THREE.Group>();
	let stagedSourcePoint: EngineeringControlPoint | null = null;
	let stagedTargetPoint: THREE.Vector3 | null = null;
	let solvedResult: PrecisionRegistrationResult | null = null;
	let savedResult: PrecisionRegistrationResult | null = null;

	return {
		handleSourceSelection(sourcePoint) {

			store.patch( {
				precisionRegistration: {
					...store.getState().precisionRegistration,
					selectedSourcePoint: sourcePoint
				}
			} );

		},

		armSourcePoint() {

			const precisionState = store.getState().precisionRegistration;
			const sourcePoint = sourcePointsById.get( precisionState.selectedSourcePoint ) ?? null;
			if ( sourcePoint === null ) {
				setStatus( 'Please select a model control point first.' );
				return;
			}

			stagedSourcePoint = sourcePoint;
			stagedTargetPoint = null;
			patchPrecisionState( {
				stagedSourcePoint: sourcePoint.id,
				stagedTargetPoint: 'Not confirmed',
				workflowStatusText: `Locked source point ${sourcePoint.id}. Confirm the matching field point.`
			} );
			setStatus( `Selected source control point ${sourcePoint.id}.` );

		},

		confirmTargetPoint() {

			if ( stagedSourcePoint === null ) {
				setStatus( 'Please lock a source control point first.' );
				return;
			}

			const targetPoint = getTargetPoint( tempTargetPoint );
			if ( targetPoint === null ) {
				setStatus( 'No valid field point is available. Aim at a detected plane and try again.' );
				return;
			}

			stagedTargetPoint = targetPoint.clone();
			const targetLabel = formatVectorLabel( stagedTargetPoint );
			patchPrecisionState( {
				stagedTargetPoint: targetLabel,
				workflowStatusText: `Confirmed field point ${targetLabel}. Add this pair to the solve list.`
			} );
			setStatus( `Confirmed field point ${targetLabel}.` );

		},

		addPair() {

			if ( stagedSourcePoint === null || stagedTargetPoint === null ) {
				setStatus( 'Prepare both a source point and a field target point before adding a pair.' );
				return;
			}

			const nextPair: PrecisionPair = {
				sourcePointId: stagedSourcePoint.id,
				sourceModelLocal: stagedSourcePoint.modelLocal.clone(),
				targetAr: stagedTargetPoint.clone()
			};
			pairs.push( nextPair );
			stagedSourcePoint = null;
			stagedTargetPoint = null;
			solvedResult = null;

			patchPrecisionState( {
				stagedSourcePoint: 'Not selected',
				stagedTargetPoint: 'Not confirmed',
				pairSummaries: createPairSummaries(),
				rmsText: '--',
				workflowStatusText: pairs.length >= MIN_SOLVE_PAIR_COUNT
					? 'Enough pairs collected. Solve precision registration when ready.'
					: `Collected ${pairs.length} pair(s). At least ${MIN_SOLVE_PAIR_COUNT} are required.`
			} );
			setStatus( `Added precision pair ${pairs.length}.` );

		},

		solve() {

			const placedModel = getPlacedModel();
			const modelId = getCurrentModelId();
			if ( placedModel === null || modelId === null ) {
				setStatus( 'Place a model before solving precision registration.' );
				return;
			}

			if ( pairs.length < MIN_SOLVE_PAIR_COUNT ) {
				setStatus( `At least ${MIN_SOLVE_PAIR_COUNT} control-point pairs are required.` );
				return;
			}

			placedModel.updateMatrixWorld( true );
			const sourcePoints = pairs.map( ( pair ) => (
				placedModel.localToWorld( tempSourcePoint.copy( pair.sourceModelLocal ) ).clone()
			) );
			const targetPoints = pairs.map( ( pair ) => pair.targetAr.clone() );
			const delta = solveSimilarityTransform( sourcePoints, targetPoints, 'similarity' );

			solvedResult = {
				modelId,
				position: delta.translation.clone(),
				quaternion: delta.rotation.clone(),
				scale: delta.scale,
				rmsErrorMeters: delta.rmsErrorMeters,
				pairCount: pairs.length,
				sourcePointIds: pairs.map( ( pair ) => pair.sourcePointId ),
				updatedAt: new Date().toISOString()
			};

			applyDeltaToModel( placedModel, solvedResult );
			appliedModels.add( placedModel );
			onApplied?.();

			patchPrecisionState( {
				rmsText: `${delta.rmsErrorMeters.toFixed( 3 )}m`,
				workflowStatusText: `Solved and applied precision delta from ${pairs.length} pair(s). Save to reuse it next time.`
			} );
			setStatus( `Precision registration solved. RMS ${delta.rmsErrorMeters.toFixed( 3 )}m.` );

		},

		save() {

			if ( solvedResult === null ) {
				setStatus( 'Solve precision registration before saving.' );
				return;
			}

			savePrecisionRegistrationResult( solvedResult );
			savedResult = solvedResult;
			patchPrecisionState( {
				workflowStatusText: `Saved precision registration. It will be reused on the next placement.`
			} );
			setStatus( 'Precision registration saved.' );

		},

		clear() {

			pairs.length = 0;
			stagedSourcePoint = null;
			stagedTargetPoint = null;
			solvedResult = null;
			store.patch( {
				precisionRegistration: {
					...createDefaultPrecisionRegistrationState(),
					availableSourcePoints: store.getState().precisionRegistration.availableSourcePoints,
					selectedSourcePoint: store.getState().precisionRegistration.selectedSourcePoint
				}
			} );
			setStatus( 'Precision registration pairs cleared.' );

		},

		clearSaved(modelId) {

			clearPrecisionRegistrationResult( modelId );
			savedResult = null;
			solvedResult = null;
			appliedModels = new WeakSet<THREE.Group>();
			patchPrecisionState( {
				rmsText: '--',
				workflowStatusText: 'Cleared saved precision registration. Collect control points again if needed.'
			} );
			setStatus( 'Saved precision registration cleared.' );

		},

		loadSavedResult(modelId) {

			savedResult = loadPrecisionRegistrationResult( modelId );
			solvedResult = null;
			appliedModels = new WeakSet<THREE.Group>();

			if ( savedResult === null ) {
				patchPrecisionState( {
					rmsText: '--',
					workflowStatusText: 'No saved precision registration. Collect control points if field correction is needed.'
				} );
				return;
			}

			patchPrecisionState( {
				rmsText: `${savedResult.rmsErrorMeters.toFixed( 3 )}m`,
				workflowStatusText: `Loaded saved precision registration from ${savedResult.updatedAt}. It will apply after placement.`
			} );

		},

		applySavedResult(placedModel) {

			if ( placedModel === null || savedResult === null || appliedModels.has( placedModel ) ) {
				return false;
			}

			applyDeltaToModel( placedModel, savedResult );
			appliedModels.add( placedModel );
			onApplied?.();
			patchPrecisionState( {
				rmsText: `${savedResult.rmsErrorMeters.toFixed( 3 )}m`,
				workflowStatusText: `Applied saved precision registration. RMS ${savedResult.rmsErrorMeters.toFixed( 3 )}m.`
			} );
			setStatus( 'Applied saved precision registration result.' );
			return true;

		},

		updateSourcePointOptions(sourcePoints) {

			sourcePointsById.clear();
			for ( const point of sourcePoints ) {
				sourcePointsById.set( point.id, point );
			}

			const sourcePointIds = sourcePoints.map( ( point ) => point.id );
			store.patch( {
				precisionRegistration: {
					...store.getState().precisionRegistration,
					availableSourcePoints: sourcePointIds,
					selectedSourcePoint: sourcePointIds[ 0 ] ?? ''
				}
			} );

		}
	};

	function patchPrecisionState(
		partialState: Partial<ReturnType<typeof createDefaultPrecisionRegistrationState>>
	): void {

		store.patch( {
			precisionRegistration: {
				...store.getState().precisionRegistration,
				...partialState
			}
		} );

	}

	function createPairSummaries(): string[] {

		return pairs.map( ( pair, index ) => (
			`${index + 1}. ${pair.sourcePointId} -> ${formatVectorLabel( pair.targetAr )}`
		) );

	}

}

function applyDeltaToModel(
	placedModel: THREE.Group,
	result: PrecisionRegistrationResult
): void {

	placedModel.updateMatrixWorld( true );
	const deltaMatrix = new THREE.Matrix4().compose(
		result.position,
		result.quaternion,
		tempDeltaScale.set( result.scale, result.scale, result.scale )
	);
	tempNextWorldMatrix.multiplyMatrices( deltaMatrix, placedModel.matrixWorld );

	if ( placedModel.parent !== null ) {
		placedModel.parent.updateMatrixWorld( true );
		tempParentInverse.copy( placedModel.parent.matrixWorld ).invert();
		tempNextLocalMatrix.multiplyMatrices( tempParentInverse, tempNextWorldMatrix );
	} else {
		tempNextLocalMatrix.copy( tempNextWorldMatrix );
	}

	tempNextLocalMatrix.decompose(
		placedModel.position,
		placedModel.quaternion,
		placedModel.scale
	);
	placedModel.updateMatrixWorld( true );

}

function formatVectorLabel(vector: THREE.Vector3): string {

	return `(${vector.x.toFixed( 2 )}, ${vector.y.toFixed( 2 )}, ${vector.z.toFixed( 2 )})`;

}
