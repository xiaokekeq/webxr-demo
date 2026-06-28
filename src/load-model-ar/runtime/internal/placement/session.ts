import * as THREE from 'three';
import type { ARSceneBundle, CoarsePlacementEstimate, XRHitTestController } from '../../../shared/types.js';
import { clearPlacedModel } from '../../model.js';
import type { ArFromEnuSolution } from '../../../registration/ar-from-enu-solution.js';
import type { EngineeringRegistrationSolution } from '../../../registration/engineering-registration.js';
import type { ManualPlacementBase } from '../../../registration/manual-registration.js';
import { createDefaultTargetGuidanceState } from '../../../registration/registration-store.js';
import { createPlacementSummaryState } from '../runtime/view-state.js';
import {
	createAutoPlacementBase,
	createPlacementBaseFromArLocalizationSolution,
	createDesktopPreviewBase,
	placeAdjustedModel
} from './runtime.js';
import { fitDesktopPreviewCamera } from './camera-fit.js';
import type { PropertySelectionController } from '../interaction/property-selection.js';

type ArPlacementSource =
	| 'hit-test'
	| 'coarse-registration'
	| 'marker'
	| 'manual'
	| 'front-preview'
	| 'unknown';

interface TrackedArPlacementTransform {
	source: ArPlacementSource;
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	scale: THREE.Vector3;
}

interface CreatePlacementSessionOptions {
	store: {
		getState(): {
			autoPreviewPlacementEnabled: boolean;
		};
		patch(partialState: {
			placementSummary?: ReturnType<typeof createPlacementSummaryState>;
			targetGuidance?: ReturnType<typeof createDefaultTargetGuidanceState>;
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
	getPreviewPlacedModel(): THREE.Group | null;
	getArPlacedModel(): THREE.Group | null;
	getPlacementBase(): ManualPlacementBase | null;
	getCoarsePlacementPending(): boolean;
	markCoarsePlacementPending(): void;
	resetPlacement(): void;
	requestAutoPlacement(modelTemplate: THREE.Group | null): void;
	attemptCoarsePlacement(args: {
		xrHitTest: XRHitTestController;
		modelTemplate: THREE.Group | null;
		registrationSolution: EngineeringRegistrationSolution | null;
		arFromEnuSolutionOverride?: ArFromEnuSolution | null;
		coarseRegistration: {
			canEstimate(): boolean;
			estimatePlacement(cameraWorldPosition: THREE.Vector3, groundY: number): CoarsePlacementEstimate | null;
			getMissingRequirementMessage(): string;
		};
		manualApplyToPlacement(
			base: ManualPlacementBase,
			targetPosition: THREE.Vector3,
			targetOrientation: THREE.Quaternion
		): { position: THREE.Vector3; orientation: THREE.Quaternion; scale: number };
		manualPositionTarget: THREE.Vector3;
		manualOrientationTarget: THREE.Quaternion;
		modelOrientationTarget: THREE.Quaternion;
		cameraWorldPosition: THREE.Vector3;
		onPlacementBaseResolved?(base: ManualPlacementBase): void;
	}): void;
	applyArLocalizationSolution(args: {
		modelTemplate: THREE.Group | null;
		registrationSolution: EngineeringRegistrationSolution | null;
		arFromEnuSolution: ArFromEnuSolution;
		manualApplyToPlacement(
			base: ManualPlacementBase,
			targetPosition: THREE.Vector3,
			targetOrientation: THREE.Quaternion
		): { position: THREE.Vector3; orientation: THREE.Quaternion; scale: number };
		manualPositionTarget: THREE.Vector3;
		manualOrientationTarget: THREE.Quaternion;
	}): boolean;
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
		manualApplyToPlacement(
			base: ManualPlacementBase,
			targetPosition: THREE.Vector3,
			targetOrientation: THREE.Quaternion
		): { position: THREE.Vector3; orientation: THREE.Quaternion; scale: number };
		manualPositionTarget: THREE.Vector3;
		manualOrientationTarget: THREE.Quaternion;
		registrationSolution: EngineeringRegistrationSolution | null;
	}): void;
	fitDesktopPreviewToCamera(): void;
	updateDesktopInteractionState(isDesktopLayout: boolean, isPresenting: boolean): void;
	verifyWorldLockedPlacement(caller: string): void;
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

	let previewPlacedModel: THREE.Group | null = null;
	let arPlacedModel: THREE.Group | null = null;
	let previewPlacementBase: ManualPlacementBase | null = null;
	let arPlacementBase: ManualPlacementBase | null = null;
	let coarsePlacementPending = false;
	let trackedArPlacementTransform: TrackedArPlacementTransform | null = null;

	function getActivePlacedModel(): THREE.Group | null {

		return sceneBundle.renderer.xr.isPresenting ? arPlacedModel : previewPlacedModel;

	}

	function getActivePlacementBase(): ManualPlacementBase | null {

		return sceneBundle.renderer.xr.isPresenting ? arPlacementBase : previewPlacementBase;

	}

	function updatePlacementSummary(): void {

		store.patch( { placementSummary: createPlacementSummaryState( getActivePlacedModel() ) } );

	}

	function clearArPlacementTracking(): void {

		trackedArPlacementTransform = null;

	}

	function resolvePlacementSourceFromArLocalization(
		source: ArFromEnuSolution['source'] | undefined
	): ArPlacementSource {

		switch ( source ) {
			case 'marker':
				return 'marker';
			case 'manual-site-pose':
				return 'manual';
			case 'gps-imu':
				return 'coarse-registration';
			default:
				return 'unknown';
		}

	}

	function trackArPlacement(source: ArPlacementSource): void {

		if ( arPlacedModel === null ) {
			clearArPlacementTracking();
			return;
		}

		arPlacedModel.updateMatrixWorld( true );
		const position = arPlacedModel.getWorldPosition( new THREE.Vector3() );
		const quaternion = arPlacedModel.getWorldQuaternion( new THREE.Quaternion() );
		const scale = arPlacedModel.getWorldScale( new THREE.Vector3() );
		trackedArPlacementTransform = {
			source,
			position: position.clone(),
			quaternion: quaternion.clone(),
			scale: scale.clone()
		};

		console.info( '[WorldLockedPlacement]', {
			placed: true,
			source,
			position: vector3ToObject( position ),
			quaternion: quaternionToObject( quaternion ),
			scale: vector3ToObject( scale ),
			parentName: arPlacedModel.parent?.name ?? null
		} );

	}

	return {
		getPlacedModel() {

			return getActivePlacedModel();

		},

		getPreviewPlacedModel() {

			return previewPlacedModel;

		},

		getArPlacedModel() {

			return arPlacedModel;

		},

		getPlacementBase() {

			return getActivePlacementBase();

		},

		getCoarsePlacementPending() {

			return coarsePlacementPending;

		},

		markCoarsePlacementPending() {

			coarsePlacementPending = true;

		},

		resetPlacement() {

			previewPlacedModel = clearPlacedModel( sceneBundle.previewModelAnchor, previewPlacedModel );
			arPlacedModel = clearPlacedModel( sceneBundle.arModelAnchor, arPlacedModel );
			coarsePlacementPending = false;
			previewPlacementBase = null;
			arPlacementBase = null;
			clearArPlacementTracking();
			propertySelection.clearSelection();
			store.patch( { desktopPreviewBadge: defaultDesktopPreviewBadge } );
			updatePlacementSummary();
			store.patch( { targetGuidance: createDefaultTargetGuidanceState() } );

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
				arFromEnuSolutionOverride,
				coarseRegistration,
				manualApplyToPlacement,
				manualPositionTarget,
				manualOrientationTarget,
				modelOrientationTarget,
				cameraWorldPosition,
				onPlacementBaseResolved
			} = args;

			if (
				coarsePlacementPending === false
				|| modelTemplate === null
				|| registrationSolution === null
				|| xrHitTest.hasGroundHit() === false
			) {
				return;
			}

			const groundPosition = xrHitTest.getHitPosition( new THREE.Vector3() );
			if ( groundPosition === null ) {
				updateRegistrationStatusDetail( '状态：等待识别平面' );
				return;
			}

			let estimate: CoarsePlacementEstimate | null = null;
			let usedMarkerOverride = false;
			const previewPlacementRequested = store.getState().autoPreviewPlacementEnabled;

			if ( arFromEnuSolutionOverride !== null && arFromEnuSolutionOverride !== undefined ) {
				arPlacementBase = createPlacementBaseFromArLocalizationSolution( {
					arFromEnuSolution: arFromEnuSolutionOverride,
					modelTemplate,
					registrationSolution,
					modelOrientationTarget
				} );
				usedMarkerOverride = true;
			} else {
				if ( coarseRegistration.canEstimate() === false ) {
					return;
				}

				sceneBundle.camera.getWorldPosition( cameraWorldPosition );
				estimate = coarseRegistration.estimatePlacement( cameraWorldPosition, groundPosition.y );
				if ( estimate === null ) {
					updateRegistrationStatusDetail( '状态：等待粗配准数据' );
					setStatus( coarseRegistration.getMissingRequirementMessage() );
					return;
				}

				const shouldUsePreviewPlacementFallback = (
					estimate.distanceMeters > maxVisibleAutoPlacementDistanceMeters
					|| (
						estimate.accuracyMeters !== null
						&& estimate.accuracyMeters > maxReliableGpsAccuracyMeters
					)
				);
				const usePreviewPlacement = false;

				arPlacementBase = createAutoPlacementBase( {
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

				if ( usePreviewPlacement ) {
					coarsePlacementPending = false;
					onPlacementBaseResolved?.( arPlacementBase );
					const adjustedPlacement = manualApplyToPlacement(
						arPlacementBase,
						manualPositionTarget,
						manualOrientationTarget
					);

					arPlacedModel = placeAdjustedModel( {
						modelTemplate,
						placedModel: arPlacedModel,
						modelAnchor: sceneBundle.arModelAnchor,
						adjustedPlacement
					} );
					updateRegistrationStatusDetail( '状态：模型已放置' );
					updatePlacementSummary();

					const accuracyText = estimate.accuracyMeters === null
						? 'GPS 精度未知'
						: `GPS 精度约 ${Math.round( estimate.accuracyMeters )}m`;
					const groundLockText = `groundY ${estimate.groundY.toFixed( 3 )}m / ENU 垂向偏移${estimate.enuVerticalOffsetApplied ? '已启用' : '已禁用'}`;
					setStatus(
						shouldUsePreviewPlacementFallback
							? `目标距离约 ${Math.round( estimate.distanceMeters )}m，${accuracyText}，${groundLockText}。已切换到近距离预览放置。`
							: `已按近距离预览放置模型，${accuracyText}，${groundLockText}。`
					);
					trackArPlacement( 'front-preview' );
					return;
				}

			}

			onPlacementBaseResolved?.( arPlacementBase );
			const adjustedPlacement = manualApplyToPlacement(
				arPlacementBase,
				manualPositionTarget,
				manualOrientationTarget
			);

			arPlacedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel: arPlacedModel,
				modelAnchor: sceneBundle.arModelAnchor,
				adjustedPlacement
			} );
			trackArPlacement(
				usedMarkerOverride
					? resolvePlacementSourceFromArLocalization( arFromEnuSolutionOverride?.source )
					: 'coarse-registration'
			);

			coarsePlacementPending = false;
			updateRegistrationStatusDetail( '状态：模型已放置' );
			updatePlacementSummary();

			if ( usedMarkerOverride ) {
				setStatus( '已使用 Marker 校正结果更新 AR 放置。' );
				return;
			}

			if ( estimate === null ) {
				return;
			}

			const accuracyText = estimate.accuracyMeters === null
				? 'GPS 精度未知'
				: `GPS 精度约 ${Math.round( estimate.accuracyMeters )}m`;
			const groundLockText = `groundY ${estimate.groundY.toFixed( 3 )}m / ENU 垂向偏移${estimate.enuVerticalOffsetApplied ? '已启用' : '已禁用'}`;
			setStatus(
				`${previewPlacementRequested ? '面前预览仅作为调试开关保留；' : ''}已完成 ${registrationSolution.modelId} 的粗配准。距离约 ${Math.round( estimate.distanceMeters )}m，RMS ${registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m，${accuracyText}，${groundLockText}。`
			);

		},

		applyArLocalizationSolution(args) {

			const {
				modelTemplate,
				registrationSolution,
				arFromEnuSolution,
				manualApplyToPlacement,
				manualPositionTarget,
				manualOrientationTarget
			} = args;

			if ( modelTemplate === null || registrationSolution === null ) {
				return false;
			}

			arPlacementBase = createPlacementBaseFromArLocalizationSolution( {
				arFromEnuSolution,
				modelTemplate,
				registrationSolution,
				modelOrientationTarget: new THREE.Quaternion()
			} );

			if ( arPlacedModel === null ) {
				return false;
			}

			const adjustedPlacement = manualApplyToPlacement(
				arPlacementBase,
				manualPositionTarget,
				manualOrientationTarget
			);
			arPlacedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel: arPlacedModel,
				modelAnchor: sceneBundle.arModelAnchor,
				adjustedPlacement
			} );
			trackArPlacement( resolvePlacementSourceFromArLocalization( arFromEnuSolution.source ) );
			updatePlacementSummary();
			return true;

		},

		reapplyManualRegistration(args) {

			const {
				modelTemplate,
				manualApplyToPlacement,
				manualPositionTarget,
				manualOrientationTarget,
				registrationSolution
			} = args;

			const activePlacedModel = getActivePlacedModel();
			const activePlacementBase = getActivePlacementBase();
			if ( activePlacedModel === null || modelTemplate === null || activePlacementBase === null ) {
				if ( canUsePreviewLayout() ) {
					this.ensureDesktopPreviewPlacement( {
						modelTemplate,
						manualApplyToPlacement,
						manualPositionTarget,
						manualOrientationTarget,
						registrationSolution
					} );
				}
				return;
			}

			const adjustedPlacement = manualApplyToPlacement(
				activePlacementBase,
				manualPositionTarget,
				manualOrientationTarget
			);

			if ( sceneBundle.renderer.xr.isPresenting ) {
				arPlacedModel = placeAdjustedModel( {
					modelTemplate,
					placedModel: arPlacedModel,
					modelAnchor: sceneBundle.arModelAnchor,
					adjustedPlacement
				} );
				trackArPlacement( 'manual' );
			} else {
				previewPlacedModel = placeAdjustedModel( {
					modelTemplate,
					placedModel: previewPlacedModel,
					modelAnchor: sceneBundle.previewModelAnchor,
					adjustedPlacement
				} );
			}

			updatePlacementSummary();

		},

		ensureDesktopPreviewPlacement(args) {

			const {
				modelTemplate,
				manualApplyToPlacement,
				manualPositionTarget,
				manualOrientationTarget,
				registrationSolution
			} = args;

			if ( canUsePreviewLayout() === false || modelTemplate === null || registrationSolution === null ) {
				return;
			}

			previewPlacementBase = createDesktopPreviewBase( modelTemplate, registrationSolution );
			const adjustedPlacement = manualApplyToPlacement(
				previewPlacementBase,
				manualPositionTarget,
				manualOrientationTarget
			);

			previewPlacedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel: previewPlacedModel,
				modelAnchor: sceneBundle.previewModelAnchor,
				adjustedPlacement
			} );

			store.patch( { desktopPreviewBadge: desktopPreviewBadge } );
			updatePlacementSummary();

		},

		fitDesktopPreviewToCamera() {

			if ( canUsePreviewLayout() === false || previewPlacedModel === null ) {
				return;
			}

			fitDesktopPreviewCamera( {
				camera: sceneBundle.camera,
				controls: sceneBundle.controls,
				placedModel: previewPlacedModel,
				previewDirection
			} );

		},

		updateDesktopInteractionState(nextIsDesktopLayout, isPresenting) {

			sceneBundle.controls.enabled = nextIsDesktopLayout && isPresenting === false;

		},

		verifyWorldLockedPlacement(caller) {

			if (
				sceneBundle.renderer.xr.isPresenting === false
				|| arPlacedModel === null
				|| trackedArPlacementTransform === null
			) {
				return;
			}

			arPlacedModel.updateMatrixWorld( true );
			const currentPosition = arPlacedModel.getWorldPosition( new THREE.Vector3() );
			const currentQuaternion = arPlacedModel.getWorldQuaternion( new THREE.Quaternion() );
			const currentScale = arPlacedModel.getWorldScale( new THREE.Vector3() );
			const previous = trackedArPlacementTransform;
			const positionChanged = previous.position.distanceToSquared( currentPosition ) > 1e-8;
			const rotationChanged = 1 - Math.abs( previous.quaternion.dot( currentQuaternion ) ) > 1e-6;
			const scaleChanged = previous.scale.distanceToSquared( currentScale ) > 1e-8;

			if ( positionChanged === false && rotationChanged === false && scaleChanged === false ) {
				return;
			}

			console.warn( '[PlacementDriftWarning]', {
				reason: 'placed model transform changed after world-locked placement',
				caller,
				previousPosition: vector3ToObject( previous.position ),
				currentPosition: vector3ToObject( currentPosition )
			} );
			trackedArPlacementTransform = {
				source: previous.source,
				position: currentPosition.clone(),
				quaternion: currentQuaternion.clone(),
				scale: currentScale.clone()
			};

		}
	};

}

function vector3ToObject(vector: THREE.Vector3): { x: number; y: number; z: number } {

	return {
		x: vector.x,
		y: vector.y,
		z: vector.z
	};

}

function quaternionToObject(quaternion: THREE.Quaternion): { x: number; y: number; z: number; w: number } {

	return {
		x: quaternion.x,
		y: quaternion.y,
		z: quaternion.z,
		w: quaternion.w
	};

}



