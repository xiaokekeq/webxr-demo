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
	arSupportMessage: '正在检测 AR 支持状态...',
	arSessionPhase: 'scanning',
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
	registrationStatusDetail: '状态：等待识别平面',
	runtimeStatus: '等待初始化',
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
		setStatus( '已关闭属性面板。' );
	},
	onSelectModel: modelSession.handleModelSelection,
	onSetWorkspaceMode: setWorkspaceMode,
	onResetPlacement: handleResetPlacement,
	onShowLayers: () => {
		setStatus( '图层面板预留中，后续接入。' );
	},
	onMeasure: () => {
		setStatus( '测距工具预留中，后续接入。' );
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
		setStatus( '时间轴播放功能暂未接入。' );
	},
	onInspectionPhoto: () => {
		setStatus( '拍照入口预留中，后续接入相机能力。' );
	},
	onInspectionSave: ( draft ) => {
		setStatus(
			`已记录核查草稿：${draft.type} / ${draft.severity}${draft.note ? ` / ${draft.note}` : ''}`
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

	setStatus( '正在初始化 AR 工作区...' );
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
			appendLog( '当前设备不支持 AR，已切换到桌面预览模式。' );
		}

		void coarseRegistration.prime()
			.then( () => {
				appendLog( '粗配准传感器预热完成。' );
			} )
			.catch( () => {
				appendLog( '粗配准传感器未能自动完成预热。' );
			} );
	} catch ( error ) {
		console.error( 'AR bootstrap failed:', error );
		setStatus( error instanceof Error ? error.message : 'AR 工作区初始化失败。' );
	}

}

function renderPanels(): void {

	const state = store.getState();
	desktopPanel.render( state );
	mobilePanel.render( state );

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
		setStatus( '模型已重置，请重新识别平面后再放置模型。' );
		return;
	}

	ensureDesktopPreviewPlacement();
	placementSession.fitDesktopPreviewToCamera();
	setStatus( '模型位置已重置。' );

}

async function handleEnableCoarseRegistration(): Promise<void> {

	try {
		await coarseRegistration.enable();
		updateRegistrationStatusDetail( '状态：粗配准已启用' );
		syncArSessionPhase();
	} catch ( error ) {
		console.error( 'Coarse registration enable failed:', error );
		setStatus( error instanceof Error ? error.message : '启用粗配准失败。' );
	}

}

async function handleRefreshGeoLocation(): Promise<void> {

	try {
		await coarseRegistration.refreshGeolocation();
		setStatus( coarseRegistration.getReadyMessage() );
		syncArSessionPhase();
	} catch ( error ) {
		console.error( 'Geolocation refresh failed:', error );
		setStatus( error instanceof Error ? error.message : '刷新定位失败。' );
	}

}

function handleResetManualRegistration(): void {

	if ( demoModelConfig !== null ) {
		manualRegistration.clearSaved( demoModelConfig.modelId );
	}

	manualRegistration.reset();
	reapplyManualPlacement();
	setStatus( '手动配准已重置。' );

}

function saveManualRegistration(): void {

	if ( demoModelConfig === null ) {
		setStatus( '模型配置尚未准备完成。' );
		return;
	}

	manualRegistration.save( demoModelConfig.modelId );
	setStatus( '手动配准已保存。' );

}

function exportRegistrationSnapshot(): void {

	if ( demoModelConfig === null || registrationSolution === null ) {
		setStatus( '当前没有可导出的配准快照。' );
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

	setStatus( '配准快照已导出为 JSON。' );

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
		setStatus( 'AR 会话尚未启动。' );
		return;
	}

	if ( xrRuntime.getHitTestController().hasGroundHit() === false ) {
		setStatus( '请先识别到平面，再执行放置模型。' );
		return;
	}

	if ( modelTemplate === null || registrationSolution === null ) {
		setStatus( '模型或配准解尚未准备完成。' );
		return;
	}

	if ( coarseRegistration.canEstimate() === false ) {
		try {
			setStatus( '正在准备粗配准数据，请稍候...' );
			await warmupCoarseRegistration();
			setStatus( coarseRegistration.getReadyMessage() );
		} catch ( error ) {
			console.error( 'Coarse registration auto-enable failed:', error );
			setStatus(
				error instanceof Error
					? error.message
					: '粗配准数据准备失败，请检查定位和设备朝向权限。'
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
			setStatus( '正在放置模型...' );
			return;
		}
		setStatus( '已识别平面，但本次放置未成功。请保持手机稳定后重试。' );
		return;
	}

	hasCommittedArPlacement = true;
	store.patch( { workspaceMode: 'browse' } );
	patchArSessionPhase( 'placed' );
	pointerSelection.suppressSelectionFor( 1200 );
	syncMobileOverlayState();
	setStatus( '模型已放置，已切换到 AR 主界面。' );

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
		setStatus( '当前没有正在进行的 AR 会话。' );
		return;
	}

	void session.end();

}

function handleXRSessionStart(): void {

	hasCommittedArPlacement = false;
	pointerSelection.suppressSelectionFor( 1200 );
	store.patch( { appMode: 'ar-session', arSessionPhase: 'scanning', workspaceMode: 'browse' } );
	syncSceneHost();
	placementSession.resetPlacement();
	updateDesktopInteractionState();
	updateRegistrationStatusDetail( '状态：正在识别平面' );
	syncArSessionPhase();
	syncMobileOverlayState();

}

function handleXRSessionEnd(): void {

	hasCommittedArPlacement = false;
	store.patch( { appMode: 'pre-ar', arSessionPhase: 'scanning', workspaceMode: 'browse' } );
	syncSceneHost();
	placementSession.resetPlacement();
	updateDesktopInteractionState();
	updateRegistrationStatusDetail( '状态：等待识别平面' );
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
			updateRegistrationStatusDetail( '状态：正在识别平面' );
			break;
		case 'ready-to-place':
			updateRegistrationStatusDetail( '状态：已识别平面，可放置模型' );
			break;
		case 'placing':
			updateRegistrationStatusDetail( '正在放置模型' );
			break;
		case 'placed':
			updateRegistrationStatusDetail( '状态：模型已放置' );
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
