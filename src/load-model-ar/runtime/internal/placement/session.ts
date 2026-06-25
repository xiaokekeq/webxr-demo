import * as THREE from 'three';
import type { ARSceneBundle, CoarsePlacementEstimate, XRHitTestController } from '../../../shared/types.js';
import { clearPlacedModel } from '../../model.js';
import type { EngineeringRegistrationSolution } from '../../../registration/engineering-registration.js';
import type { ManualPlacementBase } from '../../../registration/manual-registration.js';
import type { PrecisionRegistrationResult } from '../../../registration/precision-registration-storage.js';
import { createPlacementSummaryState } from '../runtime/view-state.js';
import {
	createAutoPlacementBase,
	createDesktopPreviewBase,
	placeAdjustedModel
} from './runtime.js';
import { fitDesktopPreviewCamera } from './camera-fit.js';
import type { PropertySelectionController } from '../interaction/property-selection.js';

interface CreatePlacementSessionOptions {
	store: {
		patch(partialState: {
			placementSummary?: ReturnType<typeof createPlacementSummaryState>;
			desktopPreviewBadge?: string;
		}): void;
	};
	sceneBundle: ARSceneBundle;
	propertySelection: PropertySelectionController;
	setStatus(message: string): void;
	updateRegistrationStatusDetail(message: string): void;
	canUsePreviewLayout(): boolean;
	defaultDesktopPreviewBadge: string;
	desktopPreviewBadge: string;
	previewDirection: THREE.Vector3;
	maxVisibleAutoPlacementDistanceMeters: number;
	maxReliableGpsAccuracyMeters: number;
	previewPlacementDistanceMeters: number;
}

export interface PlacementSession {
	getPlacedModel(): THREE.Group | null;
	getCoarsePlacementPending(): boolean;
	markCoarsePlacementPending(): void;
	resetPlacement(): void;
	requestAutoPlacement(modelTemplate: THREE.Group | null): void;
	attemptCoarsePlacement(args: {
		xrHitTest: XRHitTestController;
		modelTemplate: THREE.Group | null;
		registrationSolution: EngineeringRegistrationSolution | null;
		coarseRegistration: {
			canEstimate(): boolean;
			estimatePlacement(cameraWorldPosition: THREE.Vector3, groundY: number): CoarsePlacementEstimate | null;
			getMissingRequirementMessage(): string;
		};
		modelOrientationTarget: THREE.Quaternion;
		cameraWorldPosition: THREE.Vector3;
	}): void;
	applyPrecisionRegistrationResult(result: PrecisionRegistrationResult): void;
	reapplyManualRegistration(args: {
		modelTemplate: THREE.Group | null;
		manualApplyToPlacement(
			base: ManualPlacementBase,
			targetPosition: THREE.Vector3,
			targetOrientation: THREE.Quaternion
		): { position: THREE.Vector3; orientation: THREE.Quaternion; scale: number };
		manualPositionTarget: THREE.Vector3;
		manualOrientationTarget: THREE.Quaternion;
		registrationSolution: EngineeringRegistrationSolution | null;
	}): void;
	ensureDesktopPreviewPlacement(args: {
		modelTemplate: THREE.Group | null;
		registrationSolution: EngineeringRegistrationSolution | null;
	}): void;
	fitDesktopPreviewToCamera(): void;
	updateDesktopInteractionState(isDesktopLayout: boolean, isPresenting: boolean): void;
}

export function createPlacementSession(options: CreatePlacementSessionOptions): PlacementSession {

	const {
		store,
		sceneBundle,
		propertySelection,
		setStatus,
		updateRegistrationStatusDetail,
		canUsePreviewLayout,
		defaultDesktopPreviewBadge,
		desktopPreviewBadge,
		previewDirection,
		maxVisibleAutoPlacementDistanceMeters,
		maxReliableGpsAccuracyMeters,
		previewPlacementDistanceMeters
	} = options;

	let placedModel: THREE.Group | null = null;
	let lastPlacementBase: ManualPlacementBase | null = null;
	let coarsePlacementPending = false;

	function updatePlacementSummary(): void {

		store.patch( { placementSummary: createPlacementSummaryState( placedModel ) } );

	}

	return {
		getPlacedModel() {

			return placedModel;

		},

		getCoarsePlacementPending() {

			return coarsePlacementPending;

		},

		markCoarsePlacementPending() {

			coarsePlacementPending = true;

		},

		resetPlacement() {

			placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
			coarsePlacementPending = false;
			lastPlacementBase = null;
			propertySelection.clearSelection();
			store.patch( { desktopPreviewBadge: defaultDesktopPreviewBadge } );
			updatePlacementSummary();

		},

		requestAutoPlacement(modelTemplate) {

			if ( modelTemplate === null || sceneBundle.renderer.xr.isPresenting === false ) {
				return;
			}

			coarsePlacementPending = true;
			updateRegistrationStatusDetail( '状态：等待命中可用平面' );

		},

		attemptCoarsePlacement(args) {

			const {
				xrHitTest,
				modelTemplate,
				registrationSolution,
				coarseRegistration,
				modelOrientationTarget,
				cameraWorldPosition
			} = args;

			if (
				coarsePlacementPending === false
				|| modelTemplate === null
				|| registrationSolution === null
				|| coarseRegistration.canEstimate() === false
				|| xrHitTest.hasGroundHit() === false
			) {
				return;
			}

			const groundPosition = xrHitTest.getHitPosition( new THREE.Vector3() );
			if ( groundPosition === null ) {
				updateRegistrationStatusDetail( '状态：等待识别平面' );
				return;
			}

			sceneBundle.camera.getWorldPosition( cameraWorldPosition );
			const estimate = coarseRegistration.estimatePlacement( cameraWorldPosition, groundPosition.y );
			if ( estimate === null ) {
				updateRegistrationStatusDetail( '状态：等待粗配准数据' );
				setStatus( coarseRegistration.getMissingRequirementMessage() );
				return;
			}

			const usePreviewPlacement = (
				estimate.distanceMeters > maxVisibleAutoPlacementDistanceMeters
				|| (
					estimate.accuracyMeters !== null
					&& estimate.accuracyMeters > maxReliableGpsAccuracyMeters
				)
			);

			lastPlacementBase = createAutoPlacementBase( {
				camera: sceneBundle.camera,
				cameraWorldPosition,
				groundY: groundPosition.y,
				groundPosition,
				estimate,
				modelTemplate,
				registrationSolution,
				modelOrientationTarget,
				previewDistanceMeters: previewPlacementDistanceMeters,
				usePreviewPlacement
			} );

			placedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel,
				modelAnchor: sceneBundle.modelAnchor,
				adjustedPlacement: {
					position: lastPlacementBase.position,
					orientation: lastPlacementBase.orientation,
					scale: lastPlacementBase.scale
				}
			} );

			coarsePlacementPending = false;
			updateRegistrationStatusDetail( '状态：模型已放置' );
			updatePlacementSummary();

			const accuracyText = estimate.accuracyMeters === null
				? 'GPS 精度未知'
				: `GPS 精度约 ${Math.round( estimate.accuracyMeters )}m`;

			if ( usePreviewPlacement ) {
				setStatus(
					`目标距离约 ${Math.round( estimate.distanceMeters )}m，${accuracyText}。已切换到近距离预览放置。`
				);
				return;
			}

			setStatus(
				`已完成 ${registrationSolution.modelId} 的粗配准。距离约 ${Math.round( estimate.distanceMeters )}m，RMS ${registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m，${accuracyText}。`
			);

		},

		applyPrecisionRegistrationResult(result) {

			if ( lastPlacementBase === null ) {
				return;
			}

			lastPlacementBase = transformPlacementBase( lastPlacementBase, result );
			updatePlacementSummary();

		},

		reapplyManualRegistration(args) {

			const {
				modelTemplate,
				manualApplyToPlacement,
				manualPositionTarget,
				manualOrientationTarget,
				registrationSolution
			} = args;

			if ( placedModel === null || modelTemplate === null || lastPlacementBase === null ) {
				if ( canUsePreviewLayout() ) {
					this.ensureDesktopPreviewPlacement( {
						modelTemplate,
						registrationSolution
					} );
				}
				return;
			}

			const adjustedPlacement = manualApplyToPlacement(
				lastPlacementBase,
				manualPositionTarget,
				manualOrientationTarget
			);

			placedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel,
				modelAnchor: sceneBundle.modelAnchor,
				adjustedPlacement
			} );

			updatePlacementSummary();

		},

		ensureDesktopPreviewPlacement(args) {

			const {
				modelTemplate,
				registrationSolution
			} = args;

			if ( canUsePreviewLayout() === false || modelTemplate === null || registrationSolution === null ) {
				return;
			}

			lastPlacementBase = createDesktopPreviewBase( modelTemplate, registrationSolution );

			placedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel,
				modelAnchor: sceneBundle.modelAnchor,
				adjustedPlacement: {
					position: lastPlacementBase.position,
					orientation: lastPlacementBase.orientation,
					scale: lastPlacementBase.scale
				}
			} );

			store.patch( { desktopPreviewBadge: desktopPreviewBadge } );
			updatePlacementSummary();

		},

		fitDesktopPreviewToCamera() {

			if ( canUsePreviewLayout() === false || placedModel === null ) {
				return;
			}

			fitDesktopPreviewCamera( {
				camera: sceneBundle.camera,
				controls: sceneBundle.controls,
				placedModel,
				previewDirection
			} );

		},

		updateDesktopInteractionState(nextIsDesktopLayout, isPresenting) {

			sceneBundle.controls.enabled = nextIsDesktopLayout && isPresenting === false;

		}
	};

}

function transformPlacementBase(
	base: ManualPlacementBase,
	result: Pick<PrecisionRegistrationResult, 'position' | 'quaternion' | 'scale'>
): ManualPlacementBase {

	const transformedPosition = base.position.clone()
		.applyQuaternion( result.quaternion )
		.multiplyScalar( result.scale )
		.add( result.position );
	const transformedOrientation = result.quaternion.clone().multiply( base.orientation );
	const transformedScaleAnchor = base.scaleAnchor?.clone()
		.applyQuaternion( result.quaternion )
		.multiplyScalar( result.scale )
		.add( result.position );

	return {
		position: transformedPosition,
		orientation: transformedOrientation,
		scale: base.scale * result.scale,
		scaleAnchor: transformedScaleAnchor
	};

}



