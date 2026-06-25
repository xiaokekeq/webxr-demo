import * as THREE from 'three';
import type { PipeRecord } from '../../../load-model/types.js';
import { createDesktopRuntime } from '../../runtime/internal/desktop/runtime.js';
import { createManualReadoutSync } from '../../runtime/internal/interaction/manual-readout.js';
import { createPointerSelectionSession } from '../../runtime/internal/interaction/pointer-selection.js';
import { createMobileLayoutRuntime } from '../../runtime/internal/mobile/layout-runtime.js';
import { createModelSession } from '../../runtime/internal/model/session.js';
import { createPlacementSession } from '../../runtime/internal/placement/session.js';
import { createPropertySelectionController } from '../../runtime/internal/interaction/property-selection.js';
import { createStatusRuntime } from '../../runtime/internal/runtime/status-runtime.js';
import { createRegistrationSnapshot } from '../../runtime/internal/runtime/view-state.js';
import { createWorkspaceRuntime } from '../../runtime/internal/runtime/workspace-runtime.js';
import type { DemoModelConfig } from '../../data/demo-model-config.js';
import {
	PROJECT_NAME,
	STATIC_LAYER_NAMES,
	TIMELINE_STAGES
} from '../../data/model-data.js';
import {
	createDefaultManualReadoutState,
	createDefaultPlacementSummaryState,
	createDefaultPrecisionRegistrationState,
	createDefaultPropertyPanelState,
	createDefaultRegistrationMetricsState,
	createRegistrationStore,
	type DisplayMode
} from '../../registration/registration-store.js';
import {
	composeModelQuaternionInAr,
	createCoarseTargetFromEngineeringSolution,
	type EngineeringRegistrationSolution
} from '../../registration/engineering-registration.js';
import { createCoarseRegistrationController } from '../../registration/coarse-registration.js';
import { createManualRegistrationController } from '../../registration/manual-registration.js';
import { createPrecisionRegistrationController } from '../../registration/precision-registration-controller.js';
import { createDisplayModeController } from '../../runtime/display-mode.js';
import { createARScene, resizeARScene } from '../../runtime/scene.js';
import { createDesktopPanel } from '../old-dom-ui/desktop-panel.js';
import { createStatusUpdater, getARDomElements } from '../old-dom-ui/dom.js';
import { createMobilePanel } from '../old-dom-ui/mobile-panel.js';
import { createXRSessionRuntime } from '../../runtime/xr.js';

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
	arSupportMessage: '姝ｅ湪妫€娴?AR 鏀寔鐘舵€?..',
	arSessionPhase: 'scanning',
	workspaceMode: 'browse',
	displayMode: 'normal',
	timelineStages: TIMELINE_STAGES,
	currentTimelineStageIndex: 2,
	layerNames: STATIC_LAYER_NAMES,
	pipeList: [],
	propertyPanel: createDefaultPropertyPanelState(),
	manualReadout: createDefaultManualReadoutState(),
	manualAdjustmentPreset: 'fine',
	registrationMetrics: createDefaultRegistrationMetricsState(),
	placementSummary: createDefaultPlacementSummaryState(),
	precisionRegistration: createDefaultPrecisionRegistrationState(),
	registrationStatusDetail: '鐘舵€侊細绛夊緟璇嗗埆骞抽潰',
	runtimeStatus: '绛夊緟鍒濆鍖?,
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
let hasCommittedArPlacement = false;
let coarseWarmupPromise: Promise<void> | null = null;

const manualReadoutSync = createManualReadoutSync( { store } );
const manualRegistration = createManualRegistrationController( {
	setStatus,
	onStateChange: ( state ) => {
		manualReadoutSync.update( state );
	}
} );

const precisionRegistration = createPrecisionRegistrationController( {
	store,
	setStatus,
	getPlacedModel: () => placementSession.getPlacedModel(),
	getCurrentModelId: () => demoModelConfig?.modelId ?? null,
	getTargetPoint: ( target ) => xrRuntime.getHitTestController().getHitPosition( target ),
	onApplied: () => {
		syncMobileOverlayState();
	}
} );

const propertySelection = createPropertySelectionController( {
	store,
	shouldRenderSelectionOutline: () => sceneBundle.renderer.xr.isPresenting
} );
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
const displayModeController = createDisplayModeController( {
	getPlacedModel: () => placementSession.getPlacedModel()
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
	onInspectSelection: revealBrowsePropertyPanel,
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
		syncArSessionPhase();
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
	onLoadPrecisionRegistration: ( modelId ) => {
		precisionRegistration.loadSavedResult( modelId );
	},
	onUpdatePrecisionSourcePointOptions: ( sourcePoints ) => {
		precisionRegistration.updateSourcePointOptions( sourcePoints );
	},
	canRequestAutoPlacement: () => sceneBundle.renderer.xr.isPresenting && coarseRegistration.canEstimate(),
	requestAutoPlacement
} );

store.subscribe( renderPanels );

desktopPanel.bind( {
	onSaveRegistration: saveManualRegistration,
	onExportJson: exportRegistrationSnapshot,
	onSelectModel: modelSession.handleModelSelection,
	onSetDisplayMode: handleSetDisplayMode,
	onSelectPrecisionSourcePoint: precisionRegistration.handleSourceSelection,
	onArmPrecisionSourcePoint: precisionRegistration.armSourcePoint,
	onConfirmPrecisionTargetPoint: precisionRegistration.confirmTargetPoint,
	onAddPrecisionPair: precisionRegistration.addPair,
	onSolvePrecisionRegistration: precisionRegistration.solve,
	onSavePrecisionRegistration: precisionRegistration.save,
	onClearPrecisionPairs: precisionRegistration.clear
} );

mobilePanel.bind( {
	onArUiInteraction: () => {
		pointerSelection.cancelPendingSelection( 900 );
	},
	onCloseProperty: () => {
		pointerSelection.suppressSelectionFor( 1000 );
		propertySelection.clearSelection();
		pointerSelection.suppressSelectionFor( 1000 );
		setStatus( '宸插叧闂睘鎬ч潰鏉裤€? );
	},
	onSelectModel: modelSession.handleModelSelection,
	onSetDisplayMode: handleSetDisplayMode,
	onSetWorkspaceMode: setWorkspaceMode,
	onResetPlacement: handleResetPlacement,
	onShowLayers: () => {
		setStatus( '鍥惧眰闈㈡澘棰勭暀涓紝鍚庣画鎺ュ叆銆? );
	},
	onMeasure: () => {
		setStatus( '娴嬭窛宸ュ叿棰勭暀涓紝鍚庣画鎺ュ叆銆? );
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
	onClearSavedRegistration: handleClearSavedRegistration,
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
		setStatus( '鏃堕棿杞存挱鏀惧姛鑳芥殏鏈帴鍏ャ€? );
	},
	onInspectionPhoto: () => {
		setStatus( '鎷嶇収鍏ュ彛棰勭暀涓紝鍚庣画鎺ュ叆鐩告満鑳藉姏銆? );
	},
	onInspectionSave: ( draft ) => {
		setStatus(
			`宸茶褰曟牳鏌ヨ崏绋匡細${draft.type} / ${draft.severity}${draft.note ? ` / ${draft.note}` : ''}`
		);
	},
	onEnterAr: handleEnterAr,
	onPlaceModel: handlePlaceModel,
	onExitAr: handleExitAr
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

	setStatus( '姝ｅ湪鍒濆鍖?AR 宸ヤ綔鍖?..' );
	syncSceneHost();
	sceneBundle.renderer.setAnimationLoop( xrRuntime.renderFrame );
	xrRuntime.setup();

	sceneBundle.renderer.domElement.addEventListener( 'pointerdown', pointerSelection.handlePointerDown );
	sceneBundle.renderer.domElement.addEventListener( 'pointerup', pointerSelection.handlePointerUp );
	window.addEventListener( 'pointerdown', handleGlobalArPointerDown, true );
	window.addEventListener( 'pointerup', handleGlobalArPointerUp, true );
	sceneBundle.renderer.xr.addEventListener( 'sessionstart', bindArSelectionSession );
	sceneBundle.renderer.xr.addEventListener( 'sessionend', unbindArSelectionSession );

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
			appendLog( '褰撳墠璁惧涓嶆敮鎸?AR锛屽凡鍒囨崲鍒版闈㈤瑙堟ā寮忋€? );
		}

		void coarseRegistration.prime()
			.then( () => {
				appendLog( '绮楅厤鍑嗕紶鎰熷櫒棰勭儹瀹屾垚銆? );
			} )
			.catch( () => {
				appendLog( '绮楅厤鍑嗕紶鎰熷櫒鏈兘鑷姩瀹屾垚棰勭儹銆? );
			} );
	} catch ( error ) {
		console.error( 'Legacy AR runtime failed:', error );
		setStatus( error instanceof Error ? error.message : 'AR 宸ヤ綔鍖哄垵濮嬪寲澶辫触銆? );
	}

}

function renderPanels(): void {

	const state = store.getState();
	displayModeController.sync( state.displayMode );
	desktopPanel.render( state );
	mobilePanel.render( state );

}

function handleSetDisplayMode(mode: DisplayMode): void {

	if ( mode !== 'normal' && mode !== 'xray' && mode !== 'occlusion-outline' ) {
		return;
	}

	if ( store.getState().displayMode === mode ) {
		return;
	}

	store.patch( { displayMode: mode } );
	setStatus( `鏄剧ず妯″紡宸插垏鎹负锛?{getDisplayModeLabel( mode )}` );

}

function getDisplayModeLabel(mode: DisplayMode): string {

	switch ( mode ) {
		case 'normal':
			return '鏅€氬彔鍔?;
		case 'xray':
			return '閫忚鏍告煡';
		case 'occlusion-outline':
			return '閬尅杞粨';
	}

}

function revealBrowsePropertyPanel(): void {

	const state = store.getState();
	if ( state.appMode !== 'ar-session' || state.arSessionPhase !== 'placed' ) {
		return;
	}

	if ( state.workspaceMode !== 'browse' ) {
		store.patch( { workspaceMode: 'browse' } );
	}

	mobilePanel.revealBrowsePanel();

}

function handleGlobalArPointerDown(event: PointerEvent): void {

	if ( shouldHandleGlobalArPointerEvent( event ) === false ) {
		return;
	}

	pointerSelection.handleScreenPointerDown( event.clientX, event.clientY );

}

function handleGlobalArPointerUp(event: PointerEvent): void {

	if ( shouldHandleGlobalArPointerEvent( event ) === false ) {
		return;
	}

	pointerSelection.handleScreenPointerUp( event.clientX, event.clientY );

}

function shouldHandleGlobalArPointerEvent(event: PointerEvent): boolean {

	if ( sceneBundle.renderer.xr.isPresenting === false ) {
		return false;
	}

	const target = event.target;
	if ( target instanceof Element ) {
		return target.closest(
			'#mobile-topbar, #mobile-ar-primary-bar, #mobile-right-tools, #mobile-drawer-area, #mobile-drawer-toggle, #mobile-bottom-nav, button, select, textarea, input, label, a'
		) === null;
	}

	return true;

}

function bindArSelectionSession(): void {

	const session = sceneBundle.renderer.xr.getSession();
	session?.addEventListener( 'select', pointerSelection.handleArSelect );

}

function unbindArSelectionSession(): void {

	const session = sceneBundle.renderer.xr.getSession();
	session?.removeEventListener( 'select', pointerSelection.handleArSelect );

}


function handleResetPlacement(): void {

	hasCommittedArPlacement = false;
	placementSession.resetPlacement();
	syncArSessionPhase();
	syncMobileOverlayState();
	if ( sceneBundle.renderer.xr.isPresenting ) {
		setStatus( '妯″瀷宸查噸缃紝璇烽噸鏂拌瘑鍒钩闈㈠悗鍐嶆斁缃ā鍨嬨€? );
		return;
	}

	ensureDesktopPreviewPlacement();
	placementSession.fitDesktopPreviewToCamera();
	setStatus( '妯″瀷浣嶇疆宸查噸缃€? );

}

async function handleEnableCoarseRegistration(): Promise<void> {

	try {
		await coarseRegistration.enable();
		updateRegistrationStatusDetail( '鐘舵€侊細绮楅厤鍑嗗凡鍚敤' );
		syncArSessionPhase();
	} catch ( error ) {
		console.error( 'Coarse registration enable failed:', error );
		setStatus( error instanceof Error ? error.message : '鍚敤绮楅厤鍑嗗け璐ャ€? );
	}

}

async function handleRefreshGeoLocation(): Promise<void> {

	try {
		await coarseRegistration.refreshGeolocation();
		setStatus( coarseRegistration.getReadyMessage() );
		syncArSessionPhase();
	} catch ( error ) {
		console.error( 'Geolocation refresh failed:', error );
		setStatus( error instanceof Error ? error.message : '鍒锋柊瀹氫綅澶辫触銆? );
	}

}

function handleResetManualRegistration(): void {

	if ( demoModelConfig !== null ) {
		manualRegistration.clearSaved( demoModelConfig.modelId );
	}

	manualRegistration.reset();
	reapplyManualPlacement();
	setStatus( '鎵嬪姩閰嶅噯宸查噸缃€? );

}

function handleClearSavedRegistration(): void {

	if ( demoModelConfig === null ) {
		setStatus( '褰撳墠妯″瀷閰嶇疆灏氭湭鍑嗗瀹屾垚銆? );
		return;
	}

	if ( window.confirm( `纭娓呴櫎 ${demoModelConfig.modelId} 鐨勫凡淇濆瓨閰嶅噯缁撴灉鍚楋紵` ) === false ) {
		return;
	}

	manualRegistration.clearSaved( demoModelConfig.modelId );
	precisionRegistration.clearSaved( demoModelConfig.modelId );
	manualRegistration.reset();
	reapplyManualPlacement();
	setStatus( '宸叉竻闄ゆ墜鍔ㄥ井璋冨拰绮鹃厤鍑嗙殑鍘嗗彶淇濆瓨缁撴灉銆? );

}

function saveManualRegistration(): void {

	if ( demoModelConfig === null ) {
		setStatus( '妯″瀷閰嶇疆灏氭湭鍑嗗瀹屾垚銆? );
		return;
	}

	manualRegistration.save( demoModelConfig.modelId );
	setStatus( '鎵嬪姩閰嶅噯宸蹭繚瀛樸€? );

}

function exportRegistrationSnapshot(): void {

	if ( demoModelConfig === null || registrationSolution === null ) {
		setStatus( '褰撳墠娌℃湁鍙鍑虹殑閰嶅噯蹇収銆? );
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

	setStatus( '閰嶅噯蹇収宸插鍑轰负 JSON銆? );

}

function requestAutoPlacement(): void {

	placementSession.requestAutoPlacement( modelTemplate );
	onAttemptCoarsePlacement();

}

function onAttemptCoarsePlacement(): void {

	const hadPlacedModel = placementSession.getPlacedModel() !== null;
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
	const placedModel = placementSession.getPlacedModel();
	if ( hadPlacedModel === false && placedModel !== null ) {
		precisionRegistration.applySavedResult( placedModel );
	}
	syncArSessionPhase();
	syncMobileOverlayState();

}

function handleEnterAr(): void {

	if ( store.getState().arSupportState !== 'supported' ) {
		setStatus( store.getState().arSupportMessage );
		return;
	}

	pointerSelection.suppressSelectionFor( 1200 );
	void warmupCoarseRegistration();
	xrRuntime.requestSession();

}

async function handlePlaceModel(): Promise<void> {

	if ( sceneBundle.renderer.xr.isPresenting === false ) {
		setStatus( 'AR 浼氳瘽灏氭湭鍚姩銆? );
		return;
	}

	if ( xrRuntime.getHitTestController().hasGroundHit() === false ) {
		setStatus( '璇峰厛璇嗗埆鍒板钩闈紝鍐嶆墽琛屾斁缃ā鍨嬨€? );
		return;
	}

	if ( modelTemplate === null || registrationSolution === null ) {
		setStatus( '妯″瀷鎴栭厤鍑嗚В灏氭湭鍑嗗瀹屾垚銆? );
		return;
	}

	if ( coarseRegistration.canEstimate() === false ) {
		try {
			setStatus( '姝ｅ湪鍑嗗绮楅厤鍑嗘暟鎹紝璇风◢鍊?..' );
			await warmupCoarseRegistration();
			setStatus( coarseRegistration.getReadyMessage() );
		} catch ( error ) {
			console.error( 'Coarse registration auto-enable failed:', error );
			setStatus(
				error instanceof Error
					? error.message
					: '绮楅厤鍑嗘暟鎹噯澶囧け璐ワ紝璇锋鏌ュ畾浣嶅拰璁惧鏈濆悜鏉冮檺銆?
			);
			return;
		}
	}

	if ( coarseRegistration.canEstimate() === false ) {
		setStatus( coarseRegistration.getMissingRequirementMessage() );
		return;
	}

	propertySelection.clearSelection();
	pointerSelection.suppressSelectionFor( 1200 );
	requestAutoPlacement();
	syncArSessionPhase();
	syncMobileOverlayState();

	if ( placementSession.getPlacedModel() === null ) {
		if ( placementSession.getCoarsePlacementPending() ) {
			setStatus( '姝ｅ湪鏀剧疆妯″瀷...' );
			return;
		}
		setStatus( '宸茶瘑鍒钩闈紝浣嗘湰娆℃斁缃湭鎴愬姛銆傝淇濇寔鎵嬫満绋冲畾鍚庨噸璇曘€? );
		return;
	}

	hasCommittedArPlacement = true;
	store.patch( { workspaceMode: 'browse' } );
	patchArSessionPhase( 'placed' );
	pointerSelection.suppressSelectionFor( 1200 );
	syncMobileOverlayState();
	setStatus( '妯″瀷宸叉斁缃紝宸插垏鎹㈠埌 AR 涓荤晫闈€? );

}

function warmupCoarseRegistration(): Promise<void> {

	if ( coarseRegistration.canEstimate() ) {
		return Promise.resolve();
	}

	if ( coarseWarmupPromise !== null ) {
		return coarseWarmupPromise;
	}

	coarseWarmupPromise = coarseRegistration.enable()
		.finally( () => {
			coarseWarmupPromise = null;
		} );

	return coarseWarmupPromise;

}

function handleExitAr(): void {

	const session = sceneBundle.renderer.xr.getSession();
	if ( session === null ) {
		setStatus( '褰撳墠娌℃湁姝ｅ湪杩涜鐨?AR 浼氳瘽銆? );
		return;
	}

	void session.end();

}

function handleXRSessionStart(): void {

	hasCommittedArPlacement = false;
	pointerSelection.suppressSelectionFor( 1200 );
	store.patch( { appMode: 'ar-session', arSessionPhase: 'scanning', workspaceMode: 'registration' } );
	syncSceneHost();
	placementSession.resetPlacement();
	updateDesktopInteractionState();
	updateRegistrationStatusDetail( '鐘舵€侊細姝ｅ湪璇嗗埆骞抽潰' );
	syncArSessionPhase();
	syncMobileOverlayState();

}

function handleXRSessionEnd(): void {

	hasCommittedArPlacement = false;
	store.patch( { appMode: 'pre-ar', arSessionPhase: 'scanning', workspaceMode: 'browse' } );
	syncSceneHost();
	placementSession.resetPlacement();
	updateDesktopInteractionState();
	updateRegistrationStatusDetail( '鐘舵€侊細绛夊緟璇嗗埆骞抽潰' );
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
	if ( sceneBundle.renderer.xr.isPresenting && placementSession.getPlacedModel() !== null ) {
		hasCommittedArPlacement = true;
	}
	syncMobileOverlayState();

}

function syncMobileOverlayState(): void {

	mobilePanel.setArOverlayActive(
		sceneBundle.renderer.xr.isPresenting && placementSession.getPlacedModel() !== null
	);

}

function syncArSessionPhase(): void {

	if ( sceneBundle.renderer.xr.isPresenting === false ) {
		hasCommittedArPlacement = false;
		patchArSessionPhase( 'scanning' );
		return;
	}

	if ( placementSession.getCoarsePlacementPending() ) {
		patchArSessionPhase( 'placing' );
		return;
	}

	if ( hasCommittedArPlacement || placementSession.getPlacedModel() !== null ) {
		hasCommittedArPlacement = placementSession.getPlacedModel() !== null;
		patchArSessionPhase( 'placed' );
		return;
	}

	if ( xrRuntime.getHitTestController().hasGroundHit() ) {
		patchArSessionPhase( 'ready-to-place' );
		return;
	}

	patchArSessionPhase( 'scanning' );

}

function patchArSessionPhase(
	nextPhase: 'scanning' | 'ready-to-place' | 'placing' | 'placed'
): void {

	if ( store.getState().arSessionPhase === nextPhase ) {
		return;
	}

	store.patch( { arSessionPhase: nextPhase } );

	switch ( nextPhase ) {
		case 'scanning':
			updateRegistrationStatusDetail( '鐘舵€侊細姝ｅ湪璇嗗埆骞抽潰' );
			break;
		case 'ready-to-place':
			updateRegistrationStatusDetail( '鐘舵€侊細宸茶瘑鍒钩闈紝鍙斁缃ā鍨? );
			break;
		case 'placing':
			updateRegistrationStatusDetail( '姝ｅ湪鏀剧疆妯″瀷' );
			break;
		case 'placed':
			updateRegistrationStatusDetail( '鐘舵€侊細妯″瀷宸叉斁缃? );
			break;
	}

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


