import * as THREE from 'three';
import {
	createDefaultPrecisionRegistrationState,
	type RegistrationStore
} from './registration-store.js';
import type { EngineeringControlPoint } from './engineering-registration.js';
import { solveSimilarityTransform } from './engineering-registration.js';
import {
	clearPrecisionRegistrationResult,
	loadPrecisionRegistrationResult,
	savePrecisionRegistrationResult,
	type PrecisionRegistrationResult
} from './precision-registration-storage.js';
import {
	PRECISION_STATUS_MESSAGES,
	PRECISION_WORKFLOW_MESSAGES
} from './precision-registration-messages.js';
import type { XRHitTestQuality } from '../shared/types.js';

interface CreatePrecisionRegistrationControllerOptions {
	store: RegistrationStore;
	setStatus(message: string): void;
	getPlacedModel(): THREE.Group | null;
	getCurrentModelId(): string | null;
	getTargetPoint(target: THREE.Vector3): THREE.Vector3 | null;
	getTargetPointQuality?(): XRHitTestQuality | null;
	onApplied?(result: PrecisionRegistrationResult): void;
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
	cancelStagedPair(): void;
	addPair(): void;
	removePair(index: number): void;
	solve(): void;
	save(): void;
	clear(): void;
	clearSaved(modelId: string): void;
	loadSavedResult(modelId: string): void;
	applySavedResult(placedModel: THREE.Group | null): boolean;
	updateSourcePointOptions(sourcePoints: EngineeringControlPoint[]): void;
}

const MIN_SOLVE_PAIR_COUNT = 3;
const MIN_TARGET_SAMPLE_COUNT = 6;
const MAX_TARGET_JITTER_METERS = 0.025;
const MIN_POINT_SPREAD_METERS = 0.12;

const tempTargetPoint = new THREE.Vector3();
const tempSourcePoint = new THREE.Vector3();
const tempResidualPoint = new THREE.Vector3();
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
		getTargetPointQuality,
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
				patchPrecisionState( {
					workflowStatusText: PRECISION_STATUS_MESSAGES.selectSourceFirst
				} );
				setStatus( PRECISION_STATUS_MESSAGES.selectSourceFirst );
				return;
			}

			stagedSourcePoint = sourcePoint;
			stagedTargetPoint = null;
			patchPrecisionState( {
				stagedSourcePoint: sourcePoint.id,
				stagedTargetPoint: PRECISION_WORKFLOW_MESSAGES.notConfirmed,
				targetQualityText: PRECISION_WORKFLOW_MESSAGES.notSampled,
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.lockedSource( sourcePoint.id ),
				isSourceLocked: true,
				hasConfirmedTarget: false
			} );
			setStatus( PRECISION_STATUS_MESSAGES.selectedSource( sourcePoint.id ) );

		},

		confirmTargetPoint() {

			if ( stagedSourcePoint === null ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_STATUS_MESSAGES.lockSourceFirst,
					hasConfirmedTarget: false
				} );
				setStatus( PRECISION_STATUS_MESSAGES.lockSourceFirst );
				return;
			}

			const targetPoint = getTargetPoint( tempTargetPoint );
			if ( targetPoint === null ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.noTargetPoint,
					hasConfirmedTarget: false
				} );
				setStatus( PRECISION_STATUS_MESSAGES.noTargetPoint );
				return;
			}

			const targetQuality = getTargetPointQuality?.() ?? null;
			const qualityLabel = formatQualityLabel( targetQuality );
			patchPrecisionState( {
				targetQualityText: qualityLabel,
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.targetSampling( qualityLabel ),
				hasConfirmedTarget: false
			} );

			if ( targetQuality !== null && targetQuality.sampleCount < MIN_TARGET_SAMPLE_COUNT ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.targetSamplingShort(
						targetQuality.sampleCount,
						MIN_TARGET_SAMPLE_COUNT
					)
				} );
				setStatus(
					PRECISION_STATUS_MESSAGES.targetSamplingShort(
						targetQuality.sampleCount,
						MIN_TARGET_SAMPLE_COUNT
					)
				);
				return;
			}

			if ( targetQuality !== null && targetQuality.jitterMeters > MAX_TARGET_JITTER_METERS ) {
				const jitterText = formatMeters( targetQuality.jitterMeters );
				const maxJitterText = formatMeters( MAX_TARGET_JITTER_METERS );
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.targetTooUnstable(
						jitterText,
						maxJitterText
					)
				} );
				setStatus( PRECISION_STATUS_MESSAGES.targetTooUnstable( jitterText, maxJitterText ) );
				return;
			}

			stagedTargetPoint = targetPoint.clone();
			const targetLabel = formatVectorLabel( stagedTargetPoint );
			patchPrecisionState( {
				stagedTargetPoint: targetLabel,
				targetQualityText: qualityLabel,
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.confirmedTarget(
					targetLabel,
					qualityLabel
				),
				hasConfirmedTarget: true
			} );
			setStatus( PRECISION_STATUS_MESSAGES.confirmedTarget( targetLabel, qualityLabel ) );

		},

		cancelStagedPair() {

			stagedSourcePoint = null;
			stagedTargetPoint = null;
			patchPrecisionState( {
				stagedSourcePoint: PRECISION_WORKFLOW_MESSAGES.notSelected,
				stagedTargetPoint: PRECISION_WORKFLOW_MESSAGES.notConfirmed,
				targetQualityText: PRECISION_WORKFLOW_MESSAGES.notSampled,
				workflowStatusText: pairs.length === 0
					? PRECISION_WORKFLOW_MESSAGES.captureCanceled
					: PRECISION_WORKFLOW_MESSAGES.collectedPairs( pairs.length, MIN_SOLVE_PAIR_COUNT ),
				isSourceLocked: false,
				hasConfirmedTarget: false
			} );
			setStatus( PRECISION_STATUS_MESSAGES.captureCanceled );

		},

		addPair() {

			if ( stagedSourcePoint === null || stagedTargetPoint === null ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_STATUS_MESSAGES.addPairRequiresPoints
				} );
				setStatus( PRECISION_STATUS_MESSAGES.addPairRequiresPoints );
				return;
			}

			if ( pairs.some( ( pair ) => pair.sourcePointId === stagedSourcePoint?.id ) ) {
				const duplicateMessage = PRECISION_STATUS_MESSAGES.duplicateSourcePoint( stagedSourcePoint.id );
				patchPrecisionState( {
					workflowStatusText: duplicateMessage
				} );
				setStatus( duplicateMessage );
				return;
			}

			pairs.push( {
				sourcePointId: stagedSourcePoint.id,
				sourceModelLocal: stagedSourcePoint.modelLocal.clone(),
				targetAr: stagedTargetPoint.clone()
			} );
			stagedSourcePoint = null;
			stagedTargetPoint = null;
			solvedResult = null;

			patchPrecisionState( {
				stagedSourcePoint: PRECISION_WORKFLOW_MESSAGES.notSelected,
				stagedTargetPoint: PRECISION_WORKFLOW_MESSAGES.notConfirmed,
				targetQualityText: PRECISION_WORKFLOW_MESSAGES.notSampled,
				pairSummaries: createPairSummaries(),
				pairResidualSummaries: createPairResidualSummaries(),
				rmsText: '--',
				workflowStatusText: pairs.length >= MIN_SOLVE_PAIR_COUNT
					? PRECISION_WORKFLOW_MESSAGES.enoughPairs
					: PRECISION_WORKFLOW_MESSAGES.collectedPairs( pairs.length, MIN_SOLVE_PAIR_COUNT ),
				isSourceLocked: false,
				hasConfirmedTarget: false
			} );
			setStatus( PRECISION_STATUS_MESSAGES.addedPair( pairs.length ) );

		},

		removePair(index) {

			if ( index < 0 || index >= pairs.length ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_STATUS_MESSAGES.removePairOutOfRange
				} );
				setStatus( PRECISION_STATUS_MESSAGES.removePairOutOfRange );
				return;
			}

			pairs.splice( index, 1 );
			solvedResult = null;
			patchPrecisionState( {
				pairSummaries: createPairSummaries(),
				pairResidualSummaries: createPairResidualSummaries(),
				rmsText: '--',
				workflowStatusText: pairs.length === 0
					? createDefaultPrecisionRegistrationState().workflowStatusText
					: PRECISION_WORKFLOW_MESSAGES.collectedPairs( pairs.length, MIN_SOLVE_PAIR_COUNT ),
				isSourceLocked: false,
				hasConfirmedTarget: false
			} );
			setStatus( PRECISION_STATUS_MESSAGES.removedPair( pairs.length ) );

		},

		solve() {

			const placedModel = getPlacedModel();
			const modelId = getCurrentModelId();
			if ( placedModel === null || modelId === null ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.solveBlockedByPlacement
				} );
				setStatus( PRECISION_STATUS_MESSAGES.placeModelBeforeSolve );
				return;
			}

			if ( pairs.length < MIN_SOLVE_PAIR_COUNT ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.solveBlockedByPairs(
						pairs.length,
						MIN_SOLVE_PAIR_COUNT
					)
				} );
				setStatus( PRECISION_STATUS_MESSAGES.solveRequiresMinPairs( MIN_SOLVE_PAIR_COUNT ) );
				return;
			}

			placedModel.updateMatrixWorld( true );
			const sourcePoints = pairs.map( ( pair ) => (
				placedModel.localToWorld( tempSourcePoint.copy( pair.sourceModelLocal ) ).clone()
			) );
			const targetPoints = pairs.map( ( pair ) => pair.targetAr.clone() );

			if (
				hasSufficientPointSpread( sourcePoints ) === false
				|| hasSufficientPointSpread( targetPoints ) === false
			) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.solveBlockedByGeometry
				} );
				setStatus( PRECISION_STATUS_MESSAGES.solveGeometryWeak );
				return;
			}

			const delta = solveSimilarityTransform( sourcePoints, targetPoints, 'similarity' );
			const pairResidualMeters = computePairResidualMeters( sourcePoints, targetPoints, delta );
			const rmsText = formatMeters( delta.rmsErrorMeters );
			const maxResidualText = formatMeters( Math.max( ...pairResidualMeters ) );

			solvedResult = {
				modelId,
				position: delta.translation.clone(),
				quaternion: delta.rotation.clone(),
				scale: delta.scale,
				rmsErrorMeters: delta.rmsErrorMeters,
				pairCount: pairs.length,
				sourcePointIds: pairs.map( ( pair ) => pair.sourcePointId ),
				pairResidualMeters,
				updatedAt: new Date().toISOString()
			};

			applyDeltaToModel( placedModel, solvedResult );
			appliedModels.add( placedModel );
			onApplied?.( solvedResult );

			patchPrecisionState( {
				pairSummaries: createPairSummaries(),
				pairResidualSummaries: createPairResidualSummaries( pairResidualMeters ),
				rmsText,
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.solvedApplied( pairs.length, rmsText )
			} );
			setStatus( PRECISION_STATUS_MESSAGES.solved( rmsText, maxResidualText ) );

		},

		save() {

			if ( solvedResult === null ) {
				patchPrecisionState( {
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.saveBlocked
				} );
				setStatus( PRECISION_STATUS_MESSAGES.saveBeforeSolve );
				return;
			}

			savePrecisionRegistrationResult( solvedResult );
			savedResult = solvedResult;
			patchPrecisionState( {
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.saved
			} );
			setStatus( PRECISION_STATUS_MESSAGES.saved );

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
			setStatus( PRECISION_STATUS_MESSAGES.clearedPairs );

		},

		clearSaved(modelId) {

			clearPrecisionRegistrationResult( modelId );
			savedResult = null;
			solvedResult = null;
			appliedModels = new WeakSet<THREE.Group>();
			patchPrecisionState( {
				pairResidualSummaries: createPairResidualSummaries(),
				rmsText: '--',
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.clearedSaved,
				isSourceLocked: false,
				hasConfirmedTarget: false
			} );
			setStatus( PRECISION_STATUS_MESSAGES.clearedSaved );

		},

		loadSavedResult(modelId) {

			savedResult = loadPrecisionRegistrationResult( modelId );
			solvedResult = null;
			appliedModels = new WeakSet<THREE.Group>();

			if ( savedResult === null ) {
				patchPrecisionState( {
					pairResidualSummaries: createPairResidualSummaries(),
					rmsText: '--',
					workflowStatusText: PRECISION_WORKFLOW_MESSAGES.noSaved,
					isSourceLocked: false,
					hasConfirmedTarget: false
				} );
				return;
			}

			patchPrecisionState( {
				pairResidualSummaries: createPairResidualSummaries( savedResult.pairResidualMeters ),
				rmsText: formatMeters( savedResult.rmsErrorMeters ),
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.loadedSaved( savedResult.updatedAt ),
				isSourceLocked: false,
				hasConfirmedTarget: false
			} );

		},

		applySavedResult(placedModel) {

			if ( placedModel === null || savedResult === null || appliedModels.has( placedModel ) ) {
				return false;
			}

			applyDeltaToModel( placedModel, savedResult );
			appliedModels.add( placedModel );
			onApplied?.( savedResult );
			patchPrecisionState( {
				pairResidualSummaries: createPairResidualSummaries( savedResult.pairResidualMeters ),
				rmsText: formatMeters( savedResult.rmsErrorMeters ),
				workflowStatusText: PRECISION_WORKFLOW_MESSAGES.appliedSaved(
					formatMeters( savedResult.rmsErrorMeters )
				),
				isSourceLocked: false,
				hasConfirmedTarget: false
			} );
			setStatus( PRECISION_STATUS_MESSAGES.appliedSaved );
			return true;

		},

		updateSourcePointOptions(sourcePoints) {

			sourcePointsById.clear();
			for ( const point of sourcePoints ) {
				sourcePointsById.set( point.id, point );
			}

			const sourcePointIds = sourcePoints.map( ( point ) => point.id );
			const currentSelection = store.getState().precisionRegistration.selectedSourcePoint;
			const nextSelection = sourcePointIds.includes( currentSelection )
				? currentSelection
				: sourcePointIds[ 0 ] ?? '';

			store.patch( {
				precisionRegistration: {
					...store.getState().precisionRegistration,
					availableSourcePoints: sourcePointIds,
					selectedSourcePoint: nextSelection
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

	function createPairResidualSummaries(pairResidualMeters?: number[]): string[] {

		return pairs.map( ( _, index ) => {
			const residualMeters = pairResidualMeters?.[ index ];
			if ( residualMeters === undefined ) {
				return '待求解';
			}

			return `残差 ${formatMeters( residualMeters )}`;
		} );

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

function computePairResidualMeters(
	sourcePoints: THREE.Vector3[],
	targetPoints: THREE.Vector3[],
	result: Pick<PrecisionRegistrationResult, 'position' | 'quaternion' | 'scale'>
): number[] {

	return sourcePoints.map( ( sourcePoint, index ) => tempResidualPoint
		.copy( sourcePoint )
		.applyQuaternion( result.quaternion )
		.multiplyScalar( result.scale )
		.add( result.position )
		.distanceTo( targetPoints[ index ] ) );

}

function hasSufficientPointSpread(points: THREE.Vector3[]): boolean {

	let maxDistance = 0;

	for ( let i = 0; i < points.length; i += 1 ) {
		for ( let j = i + 1; j < points.length; j += 1 ) {
			maxDistance = Math.max( maxDistance, points[ i ].distanceTo( points[ j ] ) );
		}
	}

	return maxDistance >= MIN_POINT_SPREAD_METERS;

}

function formatVectorLabel(vector: THREE.Vector3): string {

	return `(${vector.x.toFixed( 2 )}, ${vector.y.toFixed( 2 )}, ${vector.z.toFixed( 2 )})`;

}

function formatMeters(value: number): string {

	return `${value.toFixed( 3 )}m`;

}

function formatQualityLabel(quality: XRHitTestQuality | null): string {

	if ( quality === null ) {
		return PRECISION_WORKFLOW_MESSAGES.notSampled;
	}

	return `${quality.sampleCount} 帧 / 抖动 ${formatMeters( quality.jitterMeters )}`;

}
