import * as THREE from 'three';
import type { PipeRecord } from '../load-model/types.js';
import { createDesktopRuntime } from './app/desktop/runtime.js';
import { createManualReadoutSync } from './app/interaction/manual-readout.js';
import { createPointerSelectionSession } from './app/interaction/pointer-selection.js';
import { createMobileLayoutRuntime } from './app/mobile/layout-runtime.js';
import { createModelSession } from './app/model/session.js';
import { createPlacementSession } from './app/placement/session.js';
import { createPropertySelectionController } from './app/interaction/property-selection.js';
import { createStatusRuntime } from './app/runtime/status-runtime.js';
import { createRegistrationSnapshot } from './app/runtime/view-state.js';
import { createWorkspaceRuntime } from './app/runtime/workspace-runtime.js';
import type { DemoModelConfig } from './data/demo-model-config.js';
import {
	PROJECT_NAME,
	STATIC_LAYER_NAMES,
	TIMELINE_STAGES
} from './data/model-data.js';
import {
	createDefaultManualReadoutState,
	createDefaultPlacementSummaryState,
	createDefaultPrecisionRegistrationState,
	createDefaultPropertyPanelState,
	createDefaultRegistrationMetricsState,
	createRegistrationStore
} from './data/registration-store.js';
import {
	composeModelQuaternionInAr,
	createCoarseTargetFromEngineeringSolution,
	type EngineeringRegistrationSolution
} from './registration/engineering-registration.js';
import { createCoarseRegistrationController } from './registration/coarse-registration.js';
import { createManualRegistrationController } from './registration/manual-registration.js';
import { createPrecisionRegistrationController } from './registration/precision-registration-controller.js';
import { createARScene, resizeARScene } from './render/scene.js';
import { createDesktopPanel } from './ui/desktop-panel.js';
import { createStatusUpdater, getARDomElements } from './ui/dom.js';
import { createMobilePanel } from './ui/mobile-panel.js';
import { createXRSessionRuntime } from './xr/session-runtime.js';

const DESKTOP_MEDIA_QUERY = window.matchMedia( '(any-pointer: fine)' );

const MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS = 8;
const MAX_RELIABLE_GPS_ACCURACY_METERS = 15;
const PREVIEW_PLACEMENT_DISTANCE_METERS = 2.5;
const MAX_LOG_ITEMS = 24;
const DEFAULT_DESKTOP_PREVIEW_BADGE = '3D preview area';
const DESKTOP_PREVIEW_BADGE = '3D preview area / orbit, pan, zoom';
const DESKTOP_PREVIEW_DIRECTION = new THREE.Vector3( 0.85, 0.48, 1 );

const dom = getARDomElements();
const sceneBundle = createARScene( dom.canvasContainer );
const desktopPanel = createDesktopPanel( dom );
const mobilePanel = createMobilePanel( dom );
const updateStatusText = createStatusUpdater( dom.statusButton );

const store = createRegistrationStore( {
	projectName: PROJECT_NAME,
	modelUrl: '-',
	availableModels: [],
	selectedModelId: '',
	appMode: 'pre-ar',
	arSupportState: 'checking',
	arSupportMessage: 'Checking AR support...',
	workspaceMode: 'browse',
	timelineStages: TIMELINE_STAGES,
	currentTimelineStageIndex: 2,
	layerNames: STATIC_LAYER_NAMES,
	pipeList: [],
	propertyPanel: createDefaultPropertyPanelState(),
	manualReadout: createDefaultManualReadoutState(),
	registrationMetrics: createDefaultRegistrationMetricsState(),
	placementSummary: createDefaultPlacementSummaryState(),
	precisionRegistration: createDefaultPrecisionRegistrationState(),
	registrationStatusDetail: 'Status: waiting for plane detection',
	runtimeStatus: 'Waiting for initialization',
	desktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
	logMessages: []
} );

const cameraWorldPosition = new THREE.Vector3();
const modelOrientation = new THREE.Quaternion();
const manualPosition = new THREE.Vector3();
const manualOrientation = new THREE.Quaternion();
const desktopAxesHelper = new THREE.AxesHelper( 0.8 );
const statusRuntime = createStatusRuntime( {
	store,
	updateStatusText,
	maxLogItems: MAX_LOG_ITEMS
} );
const { setStatus, appendLog, updateRegistrationStatusDetail } = statusRuntime;

let modelTemplate: THREE.Group | null = null;
let demoModelConfig: DemoModelConfig | null = null;
let registrationSolution: EngineeringRegistrationSolution | null = null;
let coarseRegistration = createCoarseRegistrationController( { setStatus } );
let pipesByName = new Map<string, PipeRecord>();

const manualReadoutSync = createManualReadoutSync( { store } );
const manualRegistration = createManualRegistrationController( {
	setStatus,
	onStateChange: ( state ) => {
		manualReadoutSync.update( state );
	}
} );

const precisionRegistration = createPrecisionRegistrationController( {
	store,
	setStatus
} );

const propertySelection = createPropertySelectionController( { store } );
const workspaceRuntime = createWorkspaceRuntime( { store, setStatus } );
const { setWorkspaceMode, setTimelineStage } = workspaceRuntime;
const placementSession = createPlacementSession( {
	store,
	sceneBundle,
	propertySelection,
	setStatus,
	updateRegistrationStatusDetail,
	canUsePreviewLayout: () => isDesktopLayout() || store.getState().appMode === 'pre-ar',
	defaultDesktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
	desktopPreviewBadge: DESKTOP_PREVIEW_BADGE,
	previewDirection: DESKTOP_PREVIEW_DIRECTION,
	maxVisibleAutoPlacementDistanceMeters: MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS,
	maxReliableGpsAccuracyMeters: MAX_RELIABLE_GPS_ACCURACY_METERS,
	previewPlacementDistanceMeters: PREVIEW_PLACEMENT_DISTANCE_METERS
} );
const mobileLayoutRuntime = createMobileLayoutRuntime( {
	dom,
	sceneBundle,
	resizeScene: resizeARScene
} );
const pointerSelection = createPointerSelectionSession( {
	sceneBundle,
	propertySelection,
	setStatus,
	getPlacedModel: () => placementSession.getPlacedModel(),
	getWorkspaceMode: () => store.getState().workspaceMode,
	getPipesByName: () => pipesByName
} );
const desktopRuntime = createDesktopRuntime( {
	dom,
	sceneBundle,
	desktopAxesHelper,
	isDesktopLayout,
	resizeScene: resizeARScene,
	updateDesktopInteractionState,
	onEnterDesktopLayout: () => {
		ensureDesktopPreviewPlacement();
		placementSession.fitDesktopPreviewToCamera();
	},
	onAfterDesktopLayoutChange: () => {
		updateDesktopInteractionState();
	}
} );
const modelSession = createModelSession( {
	defaultDesktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
	canShowPreviewAfterModelLoad: () => isDesktopLayout() || store.getState().appMode === 'pre-ar',
	store,
	setStatus,
	appendLog,
	resetPlacement: () => {
		placementSession.resetPlacement();
		syncMobileOverlayState();
	},
	onRuntimeReset: () => {
		modelTemplate = null;
		demoModelConfig = null;
		registrationSolution = null;
		pipesByName = new Map<string, PipeRecord>();
	},
	onRuntimeBundleLoaded: ( bundle ) => {
		pipesByName = bundle.pipesByName;
		demoModelConfig = bundle.demoModelConfig;
		modelTemplate = bundle.modelTemplate;
		registrationSolution = bundle.registrationSolution;
	},
	onAfterModelLoaded: () => {
		ensureDesktopPreviewPlacement();
		placementSession.fitDesktopPreviewToCamera();
	},
	onCreateCoarseRegistrationTarget: ( solution ) => {
		coarseRegistration = createCoarseRegistrationController( {
			setStatus,
			target: createCoarseTargetFromEngineeringSolution( solution )
		} );
	},
	onLoadManualRegistration: ( modelId ) => {
		manualRegistration.load( modelId );
	},
	onUpdatePrecisionSourcePointOptions: ( sourcePointIds ) => {
		precisionRegistration.updateSourcePointOptions( sourcePointIds );
	},
	canRequestAutoPlacement: () => sceneBundle.renderer.xr.isPresenting && coarseRegistration.canEstimate(),
	requestAutoPlacement
} );

store.subscribe( renderPanels );

desktopPanel.bind( {
	onSaveRegistration: saveManualRegistration,
	onExportJson: exportRegistrationSnapshot,
	onSelectModel: modelSession.handleModelSelection,
	onSelectPrecisionSourcePoint: precisionRegistration.handleSourceSelection,
	onArmPrecisionSourcePoint: precisionRegistration.armSourcePoint,
	onConfirmPrecisionTargetPoint: precisionRegistration.confirmTargetPoint,
	onAddPrecisionPair: precisionRegistration.addPair,
	onSolvePrecisionRegistration: precisionRegistration.solve,
	onSavePrecisionRegistration: precisionRegistration.save,
	onClearPrecisionPairs: precisionRegistration.clear
} );

mobilePanel.bind( {
	onCloseProperty: () => {
		propertySelection.clearSelection();
		setStatus( 'Property panel closed.' );
	},
	onSelectModel: modelSession.handleModelSelection,
	onSetWorkspaceMode: setWorkspaceMode,
	onResetPlacement: handleResetPlacement,
	onShowLayers: () => {
		setStatus( 'Layer panel is reserved and not wired yet.' );
	},
	onMeasure: () => {
		setStatus( 'Measure tool is reserved and not wired yet.' );
	},
	onEnableCoarse: handleEnableCoarseRegistration,
	onRefreshGeo: handleRefreshGeoLocation,
	onAdjustTranslation: ( axis, direction ) => {
		manualRegistration.adjustTranslation( axis, direction );
		reapplyManualPlacement();
	},
	onAdjustYaw: ( direction ) => {
		manualRegistration.adjustYaw( direction );
		reapplyManualPlacement();
	},
	onAdjustScale: ( direction ) => {
		manualRegistration.adjustScale( direction );
		reapplyManualPlacement();
	},
	onSaveManualRegistration: saveManualRegistration,
	onResetManualRegistration: handleResetManualRegistration,
	onSelectPrecisionSourcePoint: precisionRegistration.handleSourceSelection,
	onArmPrecisionSourcePoint: precisionRegistration.armSourcePoint,
	onConfirmPrecisionTargetPoint: precisionRegistration.confirmTargetPoint,
	onAddPrecisionPair: precisionRegistration.addPair,
	onSolvePrecisionRegistration: precisionRegistration.solve,
	onSavePrecisionRegistration: precisionRegistration.save,
	onClearPrecisionPairs: precisionRegistration.clear,
	onSetTimelineStage: setTimelineStage,
	onTimelinePrev: () => {
		setTimelineStage( store.getState().currentTimelineStageIndex - 1 );
	},
	onTimelineNext: () => {
		setTimelineStage( store.getState().currentTimelineStageIndex + 1 );
	},
	onTimelinePlay: () => {
		setStatus( 'Timeline playback is not implemented yet.' );
	},
	onInspectionPhoto: () => {
		setStatus( 'Inspection photo entry is reserved for a later camera integration.' );
	},
	onInspectionSave: ( draft ) => {
		setStatus(
			`Inspection draft recorded: ${draft.type} / ${draft.severity}${draft.note ? ` / ${draft.note}` : ''}.`
		);
	},
	onEnterAr: handleEnterAr
} );

renderPanels();

const xrRuntime = createXRSessionRuntime( {
	sceneBundle,
	xrButtonWrap: dom.xrButtonWrap,
	setStatus,
	onSessionStart: handleXRSessionStart,
	onSessionEnd: handleXRSessionEnd,
	canReportStatus: () => (
		placementSession.getPlacedModel() === null
		&& placementSession.getCoarsePlacementPending() === false
	),
	onAttemptCoarsePlacement
} );

initialize();

async function initialize(): Promise<void> {

	setStatus( 'Initializing AR workspace...' );
	syncSceneHost();
	sceneBundle.renderer.setAnimationLoop( xrRuntime.renderFrame );
	xrRuntime.setup();

	sceneBundle.renderer.domElement.addEventListener( 'pointerdown', pointerSelection.handlePointerDown );
	sceneBundle.renderer.domElement.addEventListener( 'pointerup', pointerSelection.handlePointerUp );

	window.addEventListener( 'resize', onWindowResize );
	DESKTOP_MEDIA_QUERY.addEventListener( 'change', () => {
		handleViewportLayoutChange();
	} );

	try {
		const supportInfo = await xrRuntime.detectSupport();
		store.patch( {
			arSupportState: supportInfo.supported ? 'supported' : 'unsupported',
			arSupportMessage: supportInfo.message
		} );

		await modelSession.initializeCatalog();
		handleViewportLayoutChange();

		if ( isDesktopLayout() && 'xr' in navigator === false ) {
			appendLog( 'AR is not available on this device. Desktop preview mode is active.' );
		}

		void coarseRegistration.prime()
			.then( () => {
				appendLog( 'Coarse registration sensors primed.' );
				if ( sceneBundle.renderer.xr.isPresenting ) {
					requestAutoPlacement();
				}
			} )
			.catch( () => {
				appendLog( 'Coarse registration prime did not complete automatically.' );
			} );
	} catch ( error ) {
		console.error( 'AR bootstrap failed:', error );
		setStatus( error instanceof Error ? error.message : 'Failed to initialize AR workspace.' );
	}

}

function renderPanels(): void {

	const state = store.getState();
	desktopPanel.render( state );
	mobilePanel.render( state );

}


function handleResetPlacement(): void {

	placementSession.resetPlacement();
	syncMobileOverlayState();
	if ( sceneBundle.renderer.xr.isPresenting ) {
		requestAutoPlacement();
		setStatus( 'Model placement reset. Waiting for a fresh auto-placement.' );
		return;
	}

	ensureDesktopPreviewPlacement();
	placementSession.fitDesktopPreviewToCamera();
	setStatus( 'Model placement reset.' );

}

async function handleEnableCoarseRegistration(): Promise<void> {

	try {
		await coarseRegistration.enable();
		requestAutoPlacement();
		updateRegistrationStatusDetail( 'Status: coarse registration enabled' );
	} catch ( error ) {
		console.error( 'Coarse registration enable failed:', error );
		setStatus( error instanceof Error ? error.message : 'Failed to enable coarse registration.' );
	}

}

async function handleRefreshGeoLocation(): Promise<void> {

	try {
		await coarseRegistration.refreshGeolocation();
		setStatus( coarseRegistration.getReadyMessage() );
		requestAutoPlacement();
	} catch ( error ) {
		console.error( 'Geolocation refresh failed:', error );
		setStatus( error instanceof Error ? error.message : 'Failed to refresh geolocation.' );
	}

}

function handleResetManualRegistration(): void {

	if ( demoModelConfig !== null ) {
		manualRegistration.clearSaved( demoModelConfig.modelId );
	}

	manualRegistration.reset();
	reapplyManualPlacement();
	setStatus( 'Manual registration reset.' );

}

function saveManualRegistration(): void {

	if ( demoModelConfig === null ) {
		setStatus( 'Model configuration is not ready yet.' );
		return;
	}

	manualRegistration.save( demoModelConfig.modelId );
	setStatus( 'Manual registration saved.' );

}

function exportRegistrationSnapshot(): void {

	if ( demoModelConfig === null || registrationSolution === null ) {
		setStatus( 'There is no registration snapshot to export.' );
		return;
	}

	const snapshot = createRegistrationSnapshot( {
		demoModelConfig,
		registrationSolution,
		currentStage: store.getState().timelineStages[ store.getState().currentTimelineStageIndex ],
		manualReadout: store.getState().manualReadout,
		placedModel: placementSession.getPlacedModel()
	} );

	const blob = new Blob( [ JSON.stringify( snapshot, null, 2 ) ], { type: 'application/json' } );
	const url = URL.createObjectURL( blob );
	const link = document.createElement( 'a' );

	link.href = url;
	link.download = `${demoModelConfig.modelId}-registration.json`;
	link.click();
	URL.revokeObjectURL( url );

	setStatus( 'Registration snapshot exported as JSON.' );

}

function requestAutoPlacement(): void {

	placementSession.requestAutoPlacement( modelTemplate );
	onAttemptCoarsePlacement();

}

function onAttemptCoarsePlacement(): void {

	placementSession.attemptCoarsePlacement( {
		xrHitTest: xrRuntime.getHitTestController(),
		modelTemplate,
		registrationSolution,
		coarseRegistration,
		modelOrientationTarget: modelOrientation,
		cameraWorldPosition,
		manualApplyToPlacement: manualRegistration.applyToPlacement,
		manualPositionTarget: manualPosition,
		manualOrientationTarget: manualOrientation
	} );
	syncMobileOverlayState();

}

function handleEnterAr(): void {

	if ( store.getState().arSupportState !== 'supported' ) {
		setStatus( store.getState().arSupportMessage );
		return;
	}

	xrRuntime.requestSession();

}

function handleXRSessionStart(): void {

	store.patch( { appMode: 'ar-session' } );
	syncSceneHost();
	placementSession.resetPlacement();
	updateDesktopInteractionState();
	updateRegistrationStatusDetail( 'Status: coarse registration armed' );
	if ( coarseRegistration.canEstimate() ) {
		placementSession.markCoarsePlacementPending();
	}
	syncMobileOverlayState();

}

function handleXRSessionEnd(): void {

	store.patch( { appMode: 'pre-ar' } );
	syncSceneHost();
	placementSession.resetPlacement();
	updateDesktopInteractionState();
	updateRegistrationStatusDetail( 'Status: waiting for plane detection' );
	if ( isDesktopLayout() || store.getState().appMode === 'pre-ar' ) {
		ensureDesktopPreviewPlacement();
		placementSession.fitDesktopPreviewToCamera();
	}
	syncMobileOverlayState();

}

function ensureDesktopPreviewPlacement(): void {

	placementSession.ensureDesktopPreviewPlacement( {
		modelTemplate,
		registrationSolution,
		manualApplyToPlacement: manualRegistration.applyToPlacement,
		manualPositionTarget: manualPosition,
		manualOrientationTarget: manualOrientation
	} );

}

function updateDesktopInteractionState(): void {

	placementSession.updateDesktopInteractionState(
		isDesktopLayout() || store.getState().appMode === 'pre-ar',
		sceneBundle.renderer.xr.isPresenting
	);

}

function onWindowResize(): void {

	if ( isDesktopLayout() ) {
		desktopRuntime.handleWindowResize();
		return;
	}

	mobileLayoutRuntime.handleWindowResize();

}

function reapplyManualPlacement(): void {

	placementSession.reapplyManualRegistration( {
		modelTemplate,
		registrationSolution,
		manualApplyToPlacement: manualRegistration.applyToPlacement,
		manualPositionTarget: manualPosition,
		manualOrientationTarget: manualOrientation
	} );
	syncMobileOverlayState();

}

function syncMobileOverlayState(): void {

	mobilePanel.setArOverlayActive(
		sceneBundle.renderer.xr.isPresenting && placementSession.getPlacedModel() !== null
	);

}

function handleViewportLayoutChange(): void {

	syncSceneHost();
	desktopRuntime.updateSceneDecorations();

	if ( isDesktopLayout() || store.getState().appMode === 'pre-ar' ) {
		ensureDesktopPreviewPlacement();
		placementSession.fitDesktopPreviewToCamera();
	}

}

function syncSceneHost(): void {

	if ( isDesktopLayout() ) {
		desktopRuntime.syncCanvasHost();
		return;
	}

	mobileLayoutRuntime.syncCanvasHost( store.getState().appMode );
	updateDesktopInteractionState();

}

function isDesktopLayout(): boolean {

	return DESKTOP_MEDIA_QUERY.matches;

}
