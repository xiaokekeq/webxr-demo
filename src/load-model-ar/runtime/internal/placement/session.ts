import * as THREE from 'three';
import type { ARSceneBundle, CoarsePlacementEstimate, XRAnchorHandle, XRHitTestController } from '../../../shared/types.js';
import { clearPlacedModel } from '../../model.js';
import type { ArFromEnuSolution } from '../../../registration/ar-from-enu-solution.js';
import type { EngineeringRegistrationSolution } from '../../../registration/engineering-registration.js';
import type { ManualPlacementBase } from '../../../registration/manual-registration.js';
import { createDefaultTargetGuidanceState } from '../../../registration/registration-store.js';
import { createPlacementSummaryState } from '../runtime/view-state.js';
import {
	createAutoPlacementBase,
	createFrontPreviewPlacementBase,
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

const tempAnchorMatrix = new THREE.Matrix4();
const tempAnchorPosition = new THREE.Vector3();
const tempAnchorQuaternion = new THREE.Quaternion();
const tempAnchorScale = new THREE.Vector3();
const tempAnchorWorldQuaternion = new THREE.Quaternion();
const tempLocalPosition = new THREE.Vector3();
const tempLocalOrientation = new THREE.Quaternion();

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
	updateArPlacementAnchor(frame: XRFrame): void;
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
		previewPlacementDistanceMeters
	} = options;

	let previewPlacedModel: THREE.Group | null = null;
	let arPlacedModel: THREE.Group | null = null;
	let previewPlacementBase: ManualPlacementBase | null = null;
	let arPlacementBase: ManualPlacementBase | null = null;
	let coarsePlacementPending = false;
	let trackedArPlacementTransform: TrackedArPlacementTransform | null = null;
	let activeArAnchor: XRAnchorHandle | null = null;
	let usesArPlacementAnchor = false;
	let arAnchorRequestId = 0;

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

	function resetArPlacementAnchorTransform(): void {

		sceneBundle.arPlacementAnchor.position.set( 0, 0, 0 );
		sceneBundle.arPlacementAnchor.quaternion.identity();
		sceneBundle.arPlacementAnchor.scale.set( 1, 1, 1 );
		sceneBundle.arPlacementAnchor.updateMatrixWorld( true );

	}

	function clearActiveArAnchor(): void {

		activeArAnchor?.delete?.();
		activeArAnchor = null;
		usesArPlacementAnchor = false;
		arAnchorRequestId += 1;
		resetArPlacementAnchorTransform();

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

	}

	function applyAnchorTransformFromMatrix(matrix: THREE.Matrix4): void {

		matrix.decompose( tempAnchorPosition, tempAnchorQuaternion, tempAnchorScale );
		sceneBundle.arPlacementAnchor.position.copy( tempAnchorPosition );
		sceneBundle.arPlacementAnchor.quaternion.copy( tempAnchorQuaternion );
		sceneBundle.arPlacementAnchor.scale.set( 1, 1, 1 );
		sceneBundle.arPlacementAnchor.updateMatrixWorld( true );

	}

	function resolvePlacementRelativeToAnchor(adjustedPlacement: {
		position: THREE.Vector3;
		orientation: THREE.Quaternion;
		scale: number;
	}): {
		position: THREE.Vector3;
		orientation: THREE.Quaternion;
		scale: number;
	} {

		sceneBundle.arPlacementAnchor.updateMatrixWorld( true );
		tempLocalPosition.copy( adjustedPlacement.position );
		sceneBundle.arPlacementAnchor.worldToLocal( tempLocalPosition );
		sceneBundle.arPlacementAnchor.getWorldQuaternion( tempAnchorWorldQuaternion );
		tempLocalOrientation
			.copy( tempAnchorWorldQuaternion )
			.invert()
			.multiply( adjustedPlacement.orientation );

		return {
			position: tempLocalPosition.clone(),
			orientation: tempLocalOrientation.clone(),
			scale: adjustedPlacement.scale
		};

	}

	function tryActivateAnchorFromHit(xrHitTest: XRHitTestController, source: ArPlacementSource): boolean {

		const hitMatrix = xrHitTest.getHitMatrix( tempAnchorMatrix );
		if ( hitMatrix === null ) {
			clearActiveArAnchor();
			console.info( '[XRAnchorPlacement]', {
				created: false,
				fallback: true,
				source,
				reason: 'hit matrix unavailable'
			} );
			return false;
		}

		applyAnchorTransformFromMatrix( hitMatrix );
		activeArAnchor = null;
		usesArPlacementAnchor = true;
		const requestId = ++ arAnchorRequestId;

		if ( xrHitTest.supportsAnchors() === false ) {
			console.info( '[XRAnchorPlacement]', {
				created: false,
				fallback: true,
				source,
				reason: 'anchors unsupported'
			} );
			return true;
		}

		void xrHitTest.createAnchorFromLatestHit()
			.then( ( anchor ) => {
				if ( requestId !== arAnchorRequestId ) {
					anchor?.delete?.();
					return;
				}

				if ( anchor === null ) {
					console.info( '[XRAnchorPlacement]', {
						created: false,
						fallback: true,
						source,
						reason: 'createAnchor unavailable or failed'
					} );
					return;
				}

				activeArAnchor?.delete?.();
				activeArAnchor = anchor;
				console.info( '[XRAnchorPlacement]', {
					created: true,
					fallback: false,
					source
				} );
			} )
			.catch( ( error ) => {
				if ( requestId !== arAnchorRequestId ) {
					return;
				}

				console.warn( '[XRAnchorPlacement]', {
					created: false,
					fallback: true,
					source,
					reason: 'anchor promise rejected',
					error
				} );
			} );

		return true;

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
			clearActiveArAnchor();
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
			const previewPlacementRequested = store.getState().autoPreviewPlacementEnabled;

			if (
				coarsePlacementPending === false
				|| modelTemplate === null
				|| registrationSolution === null
				|| ( previewPlacementRequested === false && xrHitTest.hasGroundHit() === false )
			) {
				return;
			}

			const groundPosition = xrHitTest.getHitPosition( new THREE.Vector3() );
			if ( groundPosition === null && previewPlacementRequested === false ) {
				updateRegistrationStatusDetail( '状态：等待识别平面' );
				return;
			}
			const xrPlacementCamera = sceneBundle.renderer.xr.getCamera();

			let estimate: CoarsePlacementEstimate | null = null;
			let usedMarkerOverride = false;

			if ( previewPlacementRequested ) {
				if ( groundPosition === null ) {
					updateRegistrationStatusDetail( '状态：面前预览等待识别平面' );
					setStatus( '面前预览需要先识别地面或桌面，识别到平面后才会贴地放置模型。' );
					return;
				}

				xrPlacementCamera.getWorldPosition( cameraWorldPosition );
				arPlacementBase = createFrontPreviewPlacementBase( {
					camera: xrPlacementCamera,
					groundPosition,
					modelTemplate,
					registrationSolution,
					modelOrientationTarget
				} );

				coarsePlacementPending = false;
				onPlacementBaseResolved?.( arPlacementBase );
				const adjustedPlacement = manualApplyToPlacement(
					arPlacementBase,
					manualPositionTarget,
					manualOrientationTarget
				);
				const usesAnchorRoot = tryActivateAnchorFromHit( xrHitTest, 'front-preview' );
				const finalPlacement = usesAnchorRoot
					? resolvePlacementRelativeToAnchor( adjustedPlacement )
					: adjustedPlacement;

				arPlacedModel = placeAdjustedModel( {
					modelTemplate,
					placedModel: arPlacedModel,
					modelAnchor: sceneBundle.arModelAnchor,
					adjustedPlacement: finalPlacement
				} );
				updateRegistrationStatusDetail( '状态：模型已放置' );
				updatePlacementSummary();
				setStatus( '已按当前识别平面位置固定放置模型。' );
				trackArPlacement( 'front-preview' );
				return;
			}

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

				xrPlacementCamera.getWorldPosition( cameraWorldPosition );
				estimate = coarseRegistration.estimatePlacement( cameraWorldPosition, groundPosition.y );
				if ( estimate === null ) {
					updateRegistrationStatusDetail( '状态：等待粗配准数据' );
					setStatus( coarseRegistration.getMissingRequirementMessage() );
					return;
				}

				const usePreviewPlacement = false;

				arPlacementBase = createAutoPlacementBase( {
					camera: xrPlacementCamera,
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

			}

			onPlacementBaseResolved?.( arPlacementBase );
			const adjustedPlacement = manualApplyToPlacement(
				arPlacementBase,
				manualPositionTarget,
				manualOrientationTarget
			);
			const placementSource = usedMarkerOverride
				? resolvePlacementSourceFromArLocalization( arFromEnuSolutionOverride?.source )
				: 'coarse-registration';
			const usesAnchorRoot = tryActivateAnchorFromHit( xrHitTest, placementSource );
			const finalPlacement = usesAnchorRoot
				? resolvePlacementRelativeToAnchor( adjustedPlacement )
				: adjustedPlacement;

			arPlacedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel: arPlacedModel,
				modelAnchor: sceneBundle.arModelAnchor,
				adjustedPlacement: finalPlacement
			} );
			trackArPlacement( placementSource );

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
				`已完成 ${registrationSolution.modelId} 的粗配准。距离约 ${Math.round( estimate.distanceMeters )}m，RMS ${registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m，${accuracyText}，${groundLockText}。`
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
			const finalPlacement = usesArPlacementAnchor
				? resolvePlacementRelativeToAnchor( adjustedPlacement )
				: adjustedPlacement;
			arPlacedModel = placeAdjustedModel( {
				modelTemplate,
				placedModel: arPlacedModel,
				modelAnchor: sceneBundle.arModelAnchor,
				adjustedPlacement: finalPlacement
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
				const finalPlacement = usesArPlacementAnchor
					? resolvePlacementRelativeToAnchor( adjustedPlacement )
					: adjustedPlacement;
				arPlacedModel = placeAdjustedModel( {
					modelTemplate,
					placedModel: arPlacedModel,
					modelAnchor: sceneBundle.arModelAnchor,
					adjustedPlacement: finalPlacement
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

		updateArPlacementAnchor(frame) {

			if ( sceneBundle.renderer.xr.isPresenting === false || activeArAnchor === null ) {
				return;
			}

			const referenceSpace = sceneBundle.renderer.xr.getReferenceSpace();
			if ( referenceSpace === null ) {
				return;
			}

			const anchorPose = frame.getPose( activeArAnchor.anchorSpace, referenceSpace );
			if ( anchorPose === null ) {
				return;
			}

			tempAnchorMatrix.fromArray( anchorPose.transform.matrix );
			applyAnchorTransformFromMatrix( tempAnchorMatrix );

		},

		verifyWorldLockedPlacement(_caller) {

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
			trackedArPlacementTransform = {
				source: previous.source,
				position: currentPosition.clone(),
				quaternion: currentQuaternion.clone(),
				scale: currentScale.clone()
			};

		}
	};

}



