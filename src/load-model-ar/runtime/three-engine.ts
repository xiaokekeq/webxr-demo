import * as THREE from 'three';
import type { PipeRecord } from '../../load-model/types.js';
import { createManualReadoutSync } from './internal/interaction/manual-readout.js';
import { createPointerSelectionSession } from './internal/interaction/pointer-selection.js';
import { createPropertySelectionController } from './internal/interaction/property-selection.js';
import { createModelSession } from './internal/model/session.js';
import { createPlacementSession } from './internal/placement/session.js';
import { createArSessionStateRuntime } from './internal/runtime/ar-session-state-runtime.js';
import {
	exportRegistrationSnapshotFile,
	exportSceneSnapshot
} from './internal/runtime/export-runtime.js';
import { createSceneHostRuntime, type SceneHostRuntimeHosts } from './internal/runtime/scene-host-runtime.js';
import { createStatusRuntime } from './internal/runtime/status-runtime.js';
import { createWorkspaceRuntime } from './internal/runtime/workspace-runtime.js';
import {
	getFirstGeodeticPointFromDemoModelConfig,
	type DemoModelConfig
} from '../data/demo-model-config.js';
import {
	createDefaultAnnotationDetailState,
	createDefaultRegistrationChainDebugState,
	createDefaultModelScaleSummaryState,
	createDefaultSavedMarkerLocalizationState,
	createDefaultTargetGuidanceState,
	createRegistrationStore,
	type AnnotationDetailState,
	type ArDisplayMode,
	type RegistrationStore,
	type RegistrationStoreState,
	type SectionCutPlaneMode,
	type WorkspaceMode
} from '../registration/registration-store.js';
import {
	createCoarseTargetFromEngineeringSolution,
	type EngineeringRegistrationSolution
} from '../registration/engineering-registration.js';
import { createCoarseRegistrationController } from '../registration/coarse-registration.js';
import {
	createArFromEnuSolution,
	createArFromEnuSolutionFromSavedMarkerResult,
	type ArFromEnuSolution,
	type ArLocalizationSource
} from '../registration/ar-from-enu-solution.js';
import { createEnuFrame, geodeticToEnu, type GeodeticCoordinate } from '../registration/geodesy.js';
import {
	resolveMarkerPoseInEnu,
	type MarkerPoseInEnu
} from '../registration/marker-localization.js';
import {
	createManualRegistrationController,
	type ManualAdjustmentPreset
} from '../registration/manual-registration.js';
import {
	createManualArSitePoseFromPlacedModel,
	deriveManualRegistrationStateFromArSitePose,
	deserializeManualArSitePose,
	serializeManualArSitePose,
	type ManualArSitePose
} from '../registration/manual-registration-site-pose.js';
import {
	clearManualRegistrationState,
	loadResolvedManualRegistrationState,
	saveResolvedManualRegistrationState
} from '../registration/manual-registration-storage.js';
import {
	clearLastStableMarkerLocalizationResult,
	loadLastStableMarkerLocalizationResult,
	type SavedMarkerLocalizationResult
} from '../registration/marker-localization-storage.js';
import { createDisplayModeController, preserveRootTransform } from './display-mode.js';
import { createLayerVisibilityController } from './layer-visibility.js';
import { createArXrayVisualizationController } from './visualization/ar-xray-visualization.js';
import { createArLayerPeelingController } from './visualization/ar-layer-peeling.js';
import { createArSectionCutController } from './visualization/ar-section-cut.js';
import {
	createArAnnotationLabelController,
	type ArAnnotationDetailOverlay,
	type ArAnnotationItem
} from './annotation/ar-annotation-labels.js';
import {
	setAttachmentInfoBoardVisibility
} from './attachment-info-board.js';
import { computeTargetGuidanceState } from './internal/placement/target-guidance.js';
import { createARScene, resizeARScene } from './scene.js';
import { createXRSessionRuntime } from './xr.js';
import {
	getDisplayModeLabel,
	getSectionCutPlaneModeLabel
} from '../shared/display-modes.js';
import { formatGeodetic } from '../shared/formatters.js';

const MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS = 8;
const MAX_RELIABLE_GPS_ACCURACY_METERS = 15;
const PREVIEW_PLACEMENT_DISTANCE_METERS = 2.5;
const MAX_LOG_ITEMS = 24;
const DEFAULT_DESKTOP_PREVIEW_BADGE = '3D 预览区域';
const DESKTOP_PREVIEW_BADGE = '3D 预览区域 / 可旋转、平移、缩放';
const DESKTOP_PREVIEW_DIRECTION = new THREE.Vector3( 0.85, 0.48, 1 );

const PROJECT_NAME = '堤防现场辅助核查';
const TIMELINE_STAGES = [ '施工前', '基础开挖', '堤身填筑', '护坡施工', '完工核查' ] as const;
const STATIC_LAYER_NAMES = [ '三维模型', '堤身结构', '防渗层', '排水设施', '控制点', '辅助标注' ] as const;
const tempDerivedArPosition = new THREE.Vector3();
const tempDerivedArOrientation = new THREE.Quaternion();
const tempDerivedArScale = new THREE.Vector3();
const tempInverseModelToSiteRotation = new THREE.Quaternion();
const tempSiteTranslationInAr = new THREE.Vector3();
const tempNorthVectorInAr = new THREE.Vector3();

export interface ThreeEngineHosts extends SceneHostRuntimeHosts {}

export interface ThreeEngineSnapshot extends RegistrationStoreState {
	hasSelection: boolean;
	currentStatus: string;
}

function createInitialState(): RegistrationStoreState {

	return {
		projectName: PROJECT_NAME,
		modelUrl: '-',
		availableModels: [],
		selectedModelId: '',
		appMode: 'pre-ar',
		arSupportState: 'checking',
		arSupportMessage: '正在检测当前设备是否支持 WebXR AR。',
		arSessionPhase: 'scanning',
		workspaceMode: 'browse',
		displayMode: 'solid-overlay',
		structureRevealValue: 0,
		transparentXrayValue: 0,
		layerPeelingValue: 0,
		sectionCutValue: 50,
		sectionCutPlaneMode: 'horizontal-section',
		timelineStages: TIMELINE_STAGES,
		currentTimelineStageIndex: 2,
		layerNames: STATIC_LAYER_NAMES,
		modelLayers: [],
		pipeList: [],
		propertyPanel: {
			name: '未选择构件',
			statusBadge: '待选择',
			type: '-',
			diameter: '-',
			material: '-',
			depth: '-',
			status: '-',
			remark: '点击模型构件后可查看属性并进入核查。'
		},
		manualReadout: {
			positionText: '左移 0.00m / 上移 0.00m / 前移 0.00m',
			yawText: '0deg',
			scaleText: '1.000x'
		},
		manualAdjustmentPreset: 'fine',
		autoPreviewPlacementEnabled: false,
		registrationMetrics: {
			gpsText: '-',
			enuText: '-',
			rmsText: '-'
		},
		modelScaleSummary: createDefaultModelScaleSummaryState(),
		registrationChainDebug: createDefaultRegistrationChainDebugState(),
		savedMarkerLocalization: createDefaultSavedMarkerLocalizationState(),
		placementSummary: {
			positionText: '-',
			quaternionText: '-',
			scaleText: '-'
		},
		targetGuidance: createDefaultTargetGuidanceState(),
		annotationDetail: createDefaultAnnotationDetailState(),
		registrationStatusDetail: '状态：等待识别平面',
		runtimeStatus: '正在准备 AR 工作区。',
		coarseLocationDebugText: '手机 未获取 / 目标 -- / 精度 -- / 距离 --',
		desktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
		logMessages: []
	};

}

function hasSelectedPipe(state: RegistrationStoreState): boolean {

	return (
		state.propertyPanel.name !== '未选择构件'
		|| state.propertyPanel.type !== '-'
		|| state.propertyPanel.diameter !== '-'
		|| state.propertyPanel.material !== '-'
		|| state.propertyPanel.depth !== '-'
		|| state.propertyPanel.status !== '-'
	);

}

function getArSupportMessage(supported: boolean): string {

	return supported
		? '当前设备支持 WebXR AR，确认模型与阶段后即可进入现场模式。'
		: '当前设备不支持 WebXR AR，可以继续预览模型，但无法进入现场 AR 会话。';

}

export class ThreeEngine {

	private readonly store: RegistrationStore;
	private readonly sceneBundle;
	private readonly xrButtonWrap: HTMLDivElement;
	private readonly cameraWorldPosition = new THREE.Vector3();
	private readonly modelOrientation = new THREE.Quaternion();
	private readonly manualPosition = new THREE.Vector3();
	private readonly manualOrientation = new THREE.Quaternion();
	private readonly desktopAxesHelper = new THREE.AxesHelper( 0.8 );
	private readonly displayModeController;
	private readonly structureRevealController = createArXrayVisualizationController();
	private readonly layerPeelingController = createArLayerPeelingController();
	private readonly sectionCutController;
	private readonly annotationLabelsController;
	private readonly layerVisibility = createLayerVisibilityController();
	private readonly propertySelection;
	private readonly placementSession;
	private readonly modelSession;
	private readonly xrRuntime;
	private readonly manualReadoutSync;
	private readonly manualRegistration;
	private readonly workspaceRuntime;
	private readonly pointerSelection;
	private readonly arSessionStateRuntime;
	private readonly sceneHostRuntime;
	private readonly listeners = new Set<() => void>();

	private initialized = false;
	private disposed = false;
	private isDesktopLayout = window.matchMedia( '(any-pointer: fine)' ).matches;
	private currentStatus = '正在准备 AR 工作区。';
	private targetGuidanceSignature = 'hidden';
	private modelTemplate: THREE.Group | null = null;
	private demoModelConfig: DemoModelConfig | null = null;
	private registrationSolution: EngineeringRegistrationSolution | null = null;
	private resolvedMarkerPosesInEnu: MarkerPoseInEnu[] = [];
	private activeManualArSitePose: ManualArSitePose | null = null;
	private activeMarkerArFromEnuSolution: ArFromEnuSolution | null = null;
	private activeMarkerLocalizationResult: SavedMarkerLocalizationResult | null = null;
	private markerCorrectionFallbackArFromEnuSolution: ArFromEnuSolution | null = null;
	private hasRestoredManualArSitePose = false;
	private currentModelDebugTargetGeodetic: GeodeticCoordinate | null = null;
	private lastSyncedDisplayMode: ArDisplayMode | null = null;
	private lastSyncedDisplayModeRoot: THREE.Group | null = null;
	private lastVisualizationSignature = '';
	private lastAnnotationLabelsSignature = '';
	private pipesByName = new Map<string, PipeRecord>();
	private coarseWarmupPromise: Promise<void> | null = null;
	private coarseRegistration = createCoarseRegistrationController( {
		setStatus: ( message ) => {
			this.setStatus( message );
		}
	} );

	constructor() {

		this.store = createRegistrationStore( createInitialState() );
		this.xrButtonWrap = document.createElement( 'div' );
		this.xrButtonWrap.className = 'xr-button-wrap';
		this.sceneBundle = createARScene( document.createElement( 'div' ) );

		const statusRuntime = createStatusRuntime( {
			store: this.store,
			updateStatusText: ( message ) => {
				this.currentStatus = message;
			},
			maxLogItems: MAX_LOG_ITEMS
		} );

		this.manualReadoutSync = createManualReadoutSync( { store: this.store } );
		this.manualRegistration = createManualRegistrationController( {
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			onStateChange: ( state ) => {
				this.manualReadoutSync.update( state );
			},
			onPresetChange: ( preset ) => {
				this.store.patch( { manualAdjustmentPreset: preset } );
				this.emit();
			}
		} );

		this.propertySelection = createPropertySelectionController( {
			store: this.store,
			shouldRenderSelectionOutline: () => this.sceneBundle.renderer.xr.isPresenting
		} );

		this.placementSession = createPlacementSession( {
			store: this.store,
			sceneBundle: this.sceneBundle,
			propertySelection: this.propertySelection,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			updateRegistrationStatusDetail: ( message ) => {
				statusRuntime.updateRegistrationStatusDetail( message );
			},
			canUsePreviewLayout: () => this.isDesktopLayout || this.store.getState().appMode === 'pre-ar',
			defaultDesktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
			desktopPreviewBadge: DESKTOP_PREVIEW_BADGE,
			previewDirection: DESKTOP_PREVIEW_DIRECTION,
			maxVisibleAutoPlacementDistanceMeters: MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS,
			maxReliableGpsAccuracyMeters: MAX_RELIABLE_GPS_ACCURACY_METERS,
			previewPlacementDistanceMeters: PREVIEW_PLACEMENT_DISTANCE_METERS
		} );

		this.displayModeController = createDisplayModeController( {
			getPlacedModel: () => this.placementSession.getPlacedModel()
		} );
		this.sectionCutController = createArSectionCutController( this.sceneBundle.renderer );
		this.annotationLabelsController = createArAnnotationLabelController( {
			canvas: this.sceneBundle.renderer.domElement
		} );

		this.workspaceRuntime = createWorkspaceRuntime( {
			store: this.store,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			}
		} );

		this.arSessionStateRuntime = createArSessionStateRuntime( {
			store: this.store,
			isPresenting: () => this.sceneBundle.renderer.xr.isPresenting,
			hasGroundHit: () => this.xrRuntime.getHitTestController().hasGroundHit(),
			hasPlacedModel: () => this.placementSession.getArPlacedModel() !== null,
			isCoarsePlacementPending: () => this.placementSession.getCoarsePlacementPending()
		} );

		this.sceneHostRuntime = createSceneHostRuntime( {
			sceneBundle: this.sceneBundle,
			desktopAxesHelper: this.desktopAxesHelper,
			resizeScene: resizeARScene,
			updateDesktopInteractionState: ( nextIsDesktopLayout, isPresenting ) => {
				this.placementSession.updateDesktopInteractionState( nextIsDesktopLayout, isPresenting );
			}
		} );

		this.pointerSelection = createPointerSelectionSession( {
			sceneBundle: this.sceneBundle,
			propertySelection: this.propertySelection,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			onInspectSelection: () => {
				this.emit();
			},
			onSelectionApplied: ( selection ) => {
				this.updateAnnotationDetailFromSelection(
					selection.businessObject,
					selection.properties
				);
			},
			onSelectionCleared: () => {
				this.clearAnnotationDetail();
			},
			handlePreSelectionRaycast: ( selection ) => {
				const item = this.annotationLabelsController.pick( selection.raycaster );
				if ( item === null ) {
					return false;
				}

				this.handleAnnotationSelection( item );
				return true;
			},
			getPlacedModel: () => this.placementSession.getPlacedModel(),
			getWorkspaceMode: () => this.store.getState().workspaceMode,
			getPipesByName: () => this.pipesByName
		} );

		this.modelSession = createModelSession( {
			defaultDesktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
			canShowPreviewAfterModelLoad: () => this.isDesktopLayout || this.store.getState().appMode === 'pre-ar',
			store: this.store,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			appendLog: ( message ) => {
				statusRuntime.appendLog( message );
			},
			resetPlacement: () => {
				this.placementSession.resetPlacement();
				this.syncArSessionPhase();
				this.emit();
			},
			onRuntimeReset: () => {
				this.modelTemplate = null;
				this.demoModelConfig = null;
				this.registrationSolution = null;
				this.resolvedMarkerPosesInEnu = [];
				this.activeManualArSitePose = null;
				this.resetMarkerLocalizationCorrection();
				this.hasRestoredManualArSitePose = false;
				this.currentModelDebugTargetGeodetic = null;
				this.pipesByName = new Map<string, PipeRecord>();
				this.layerVisibility.reset();
				this.restoreVisualizationControllers();
				this.lastVisualizationSignature = '';
				this.lastAnnotationLabelsSignature = '';
				this.annotationLabelsController.clear();
				this.store.patch( {
					layerNames: STATIC_LAYER_NAMES,
					modelLayers: [],
					annotationDetail: createDefaultAnnotationDetailState()
				} );
				this.updateCoarseLocationDebugText();
				this.refreshSavedMarkerLocalizationResult( { silentStatus: true } );
				this.syncRegistrationChainDebug();
			},
			onRuntimeBundleLoaded: ( bundle ) => {
				this.pipesByName = bundle.pipesByName;
				this.demoModelConfig = bundle.demoModelConfig;
				this.modelTemplate = bundle.modelTemplate;
				this.registrationSolution = bundle.registrationSolution;
				this.resolvedMarkerPosesInEnu = this.resolveConfiguredMarkerPoses( bundle.demoModelConfig );
				this.currentModelDebugTargetGeodetic = getFirstGeodeticPointFromDemoModelConfig( bundle.demoModelConfig );
				this.rebuildModelLayers();
				this.updateCoarseLocationDebugText();
				this.refreshSavedMarkerLocalizationResult( { silentStatus: true } );
				this.syncRegistrationChainDebug();
			},
			onAfterModelLoaded: () => {
				this.ensureDesktopPreviewPlacement();
				this.applyModelLayerVisibility();
				this.syncSceneHost();
				this.placementSession.fitDesktopPreviewToCamera();
				this.emit();
			},
			onCreateCoarseRegistrationTarget: ( solution ) => {
				this.coarseRegistration = createCoarseRegistrationController( {
					setStatus: ( message ) => {
						statusRuntime.setStatus( message );
						this.emit();
					},
						target: createCoarseTargetFromEngineeringSolution( solution )
				} );
				this.updateCoarseLocationDebugText();
				this.syncRegistrationChainDebug();
			},
			onLoadManualRegistration: ( modelId ) => {
				this.loadManualRegistration( modelId );
			},
			canRequestAutoPlacement: () => (
				this.sceneBundle.renderer.xr.isPresenting
				&& (
					this.activeMarkerArFromEnuSolution !== null
					|| this.coarseRegistration.canEstimate()
				)
			),
			requestAutoPlacement: () => {
				this.requestAutoPlacement();
			}
		} );

		this.xrRuntime = createXRSessionRuntime( {
			sceneBundle: this.sceneBundle,
			xrButtonWrap: this.xrButtonWrap,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			onSessionStart: () => {
				this.handleXRSessionStart();
			},
			onSessionEnd: () => {
				this.handleXRSessionEnd();
			},
			canReportStatus: () => (
				this.placementSession.getArPlacedModel() === null
				&& this.placementSession.getCoarsePlacementPending() === false
			),
			onAttemptCoarsePlacement: () => {
				this.onAttemptCoarsePlacement();
			},
			onFrameUpdate: ( frame ) => {
				this.displayModeController.updateDepthState( frame );
				this.placementSession.updateArPlacementAnchor( frame );
				this.annotationLabelsController.update( this.sceneBundle.renderer.xr.getCamera() );
				this.updateTargetGuidance();
				this.placementSession.verifyWorldLockedPlacement( 'xr-frame' );
			}
		} );

		this.sceneBundle.renderer.setAnimationLoop( this.xrRuntime.renderFrame );
		this.sceneBundle.renderer.domElement.addEventListener( 'pointerdown', this.pointerSelection.handlePointerDown );
		this.sceneBundle.renderer.domElement.addEventListener( 'pointerup', this.pointerSelection.handlePointerUp );
		window.addEventListener( 'pointerdown', this.handleGlobalArPointerDown, true );
		window.addEventListener( 'pointerup', this.handleGlobalArPointerUp, true );
		window.addEventListener( 'resize', this.handleWindowResize );
		this.sceneBundle.renderer.xr.addEventListener( 'sessionstart', this.bindArSelectionSession );
		this.sceneBundle.renderer.xr.addEventListener( 'sessionend', this.unbindArSelectionSession );

		this.store.subscribe( () => {
			this.syncDisplayModeState();
			this.syncVisualizationState();
			this.syncAnnotationLabels();
			this.emit();
		} );

		this.syncDisplayModeState();
		this.syncVisualizationState();
		this.syncAnnotationLabels();

	}

	subscribe(listener: () => void): () => void {

		this.listeners.add( listener );
		return () => {
			this.listeners.delete( listener );
		};

	}

	getState(): ThreeEngineSnapshot {

		const state = this.store.getState();
		return {
			...state,
			hasSelection: hasSelectedPipe( state ),
			currentStatus: this.currentStatus
		};

	}

	mount(hosts: ThreeEngineHosts): void {

		this.sceneHostRuntime.mount( hosts, this.xrButtonWrap );
		this.syncSceneHost();
		if ( this.isDesktopLayout || this.store.getState().appMode === 'pre-ar' ) {
			this.placementSession.fitDesktopPreviewToCamera();
		}

	}

	setLayoutMode(isDesktopLayout: boolean): void {

		if ( this.isDesktopLayout === isDesktopLayout ) {
			return;
		}

		this.isDesktopLayout = isDesktopLayout;
		this.syncSceneHost();
		if ( this.isDesktopLayout || this.store.getState().appMode === 'pre-ar' ) {
			this.ensureDesktopPreviewPlacement();
			this.placementSession.fitDesktopPreviewToCamera();
		}
		this.emit();

	}

	async initialize(): Promise<void> {

		if ( this.initialized ) {
			return;
		}

		this.initialized = true;
		this.setStatus( '正在准备 AR 工作区。' );
		this.xrRuntime.setup();
		this.syncSceneHost();

		try {
			const supportInfo = await this.xrRuntime.detectSupport();
			this.store.patch( {
				arSupportState: supportInfo.supported ? 'supported' : 'unsupported',
				arSupportMessage: getArSupportMessage( supportInfo.supported )
			} );

			await this.modelSession.initializeCatalog();
			this.syncSceneHost();
			this.refreshSavedMarkerLocalizationResult( { silentStatus: true } );

			void this.coarseRegistration.prime()
				.then( () => {
					this.appendLog( '粗配准传感器预热完成。' );
					this.updateCoarseLocationDebugText();
				} )
				.catch( () => {
					this.appendLog( '粗配准预热未能自动完成。' );
					this.updateCoarseLocationDebugText();
				} );
		} catch ( error ) {
			console.error( 'AR engine initialization failed:', error );
			this.setStatus(
				error instanceof Error ? error.message : 'AR 工作区初始化失败。'
			);
		}

		this.emit();

	}

	dispose(): void {

		if ( this.disposed ) {
			return;
		}

		this.disposed = true;
		this.sceneBundle.renderer.setAnimationLoop( null );
		this.sceneBundle.renderer.domElement.removeEventListener( 'pointerdown', this.pointerSelection.handlePointerDown );
		this.sceneBundle.renderer.domElement.removeEventListener( 'pointerup', this.pointerSelection.handlePointerUp );
		window.removeEventListener( 'pointerdown', this.handleGlobalArPointerDown, true );
		window.removeEventListener( 'pointerup', this.handleGlobalArPointerUp, true );
		window.removeEventListener( 'resize', this.handleWindowResize );
		this.sceneBundle.renderer.xr.removeEventListener( 'sessionstart', this.bindArSelectionSession );
		this.sceneBundle.renderer.xr.removeEventListener( 'sessionend', this.unbindArSelectionSession );
		this.displayModeController.dispose();
		this.restoreVisualizationControllers();
		this.structureRevealController.dispose();
		this.layerPeelingController.dispose();
		this.sectionCutController.dispose();
		this.annotationLabelsController.dispose();
		this.sceneBundle.controls.dispose();
		this.sceneBundle.renderer.dispose();

	}

	handleArUiInteraction(): void {

		this.pointerSelection.cancelPendingSelection( 1400 );

	}

	closePropertyPanel(): void {

		this.pointerSelection.suppressSelectionFor( 1000 );
		this.propertySelection.clearSelection();
		this.clearAnnotationDetail();
		this.setStatus( '已关闭构件详情面板。' );

	}

	selectModel(modelId: string): void {

		this.modelSession.handleModelSelection( modelId );

	}

	setDisplayMode(mode: ArDisplayMode): void {

		if (
			mode !== 'solid-overlay'
			&& mode !== 'transparent-xray'
			&& mode !== 'layer-peeling'
			&& mode !== 'section-cut'
		) {
			return;
		}

		const state = this.store.getState();
		if ( state.displayMode === mode ) {
			return;
		}

		const previousMode = state.displayMode;
		this.store.patch( {
			displayMode: mode,
			structureRevealValue: getDisplayModeSliderValue( state, mode )
		} );

		if ( previousMode === 'layer-peeling' && mode !== 'layer-peeling' ) {
			this.layerVisibility.reset();
			this.applyModelLayerVisibility();
		} else if ( mode === 'layer-peeling' ) {
			this.layerVisibility.setHiddenLayerCount(
				percentToHiddenLayerCount( state.layerPeelingValue, this.layerVisibility.getState().length )
			);
			this.applyModelLayerVisibility();
		}

		this.setStatus( `显示模式已切换为：${getDisplayModeLabel( mode )}` );

	}

	setStructureRevealValue(value: number): void {

		const clampedValue = THREE.MathUtils.clamp( Math.round( value ), 0, 100 );
		const state = this.store.getState();
		if ( state.structureRevealValue === clampedValue && state.displayMode !== 'layer-peeling' ) {
			return;
		}

		switch ( state.displayMode ) {
			case 'transparent-xray':
				this.store.patch( {
					structureRevealValue: clampedValue,
					transparentXrayValue: clampedValue
				} );
				break;
			case 'layer-peeling':
				this.store.patch( {
					structureRevealValue: clampedValue,
					layerPeelingValue: clampedValue
				} );
				this.layerVisibility.setHiddenLayerCount(
					percentToHiddenLayerCount( clampedValue, this.layerVisibility.getState().length )
				);
				this.applyModelLayerVisibility();
				break;
			case 'section-cut':
				this.store.patch( {
					structureRevealValue: clampedValue,
					sectionCutValue: clampedValue
				} );
				break;
			default:
				this.store.patch( { structureRevealValue: clampedValue } );
				break;
		}

	}

	setSectionCutPlaneMode(mode: SectionCutPlaneMode): void {

		if (
			mode !== 'horizontal-section'
			&& mode !== 'cross-section'
			&& mode !== 'longitudinal-section'
		) {
			return;
		}

		const state = this.store.getState();
		if ( state.sectionCutPlaneMode === mode ) {
			return;
		}

		this.store.patch( { sectionCutPlaneMode: mode } );
		this.setStatus( `剖切方向已切换为：${getSectionCutPlaneModeLabel( mode )}` );

	}

	setWorkspaceMode(mode: WorkspaceMode): void {

		if ( this.store.getState().workspaceMode === mode ) {
			return;
		}

		this.workspaceRuntime.setWorkspaceMode( mode );
		this.emit();

	}

	setTimelineStage(index: number): void {

		this.workspaceRuntime.setTimelineStage( index );

	}

	timelinePrev(): void {

		this.workspaceRuntime.setTimelineStage( this.store.getState().currentTimelineStageIndex - 1 );

	}

	timelineNext(): void {

		this.workspaceRuntime.setTimelineStage( this.store.getState().currentTimelineStageIndex + 1 );

	}

	timelinePlay(): void {

		this.setStatus( '时间轴播放功能暂未接入。' );

	}

	async enableCoarseRegistration(): Promise<void> {

		try {
			await this.coarseRegistration.enable();
			this.updateCoarseLocationDebugText();
			this.store.patch( { registrationStatusDetail: '状态：粗配准已启用' } );
			this.syncArSessionPhase();
		} catch ( error ) {
			console.error( 'Coarse registration enable failed:', error );
			this.setStatus( error instanceof Error ? error.message : '启用粗配准失败。' );
		}

	}

	async refreshGeoLocation(): Promise<void> {

		try {
			await this.coarseRegistration.refreshGeolocation();
			this.updateCoarseLocationDebugText();
			this.setStatus( this.coarseRegistration.getReadyMessage() );
			this.syncArSessionPhase();
		} catch ( error ) {
			console.error( 'Geolocation refresh failed:', error );
			this.setStatus( error instanceof Error ? error.message : '刷新定位失败。' );
		}

	}

	resetPlacement(): void {

		this.arSessionStateRuntime.markPlacementCommitted( false );
		this.placementSession.resetPlacement();
		this.syncArSessionPhase();
		this.syncSceneHost();
		if ( this.sceneBundle.renderer.xr.isPresenting ) {
			this.setStatus( '模型位置已重置，请重新识别平面后再放置。' );
			return;
		}

		this.ensureDesktopPreviewPlacement();
		this.placementSession.fitDesktopPreviewToCamera();
		this.setStatus( '模型位置已重置。' );

	}

	adjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void {

		if ( this.canUseManualRegistration() === false ) {
			this.setStatus( '请先完成模型放置，再进行手动微调。' );
			return;
		}

		this.manualRegistration.adjustTranslation( axis, direction );
		this.reapplyManualPlacement();

	}

	adjustYaw(direction: 1 | -1): void {

		if ( this.canUseManualRegistration() === false ) {
			this.setStatus( '请先完成模型放置，再进行手动微调。' );
			return;
		}

		this.manualRegistration.adjustYaw( direction );
		this.reapplyManualPlacement();

	}

	adjustScale(direction: 1 | -1): void {

		if ( this.canUseManualRegistration() === false ) {
			this.setStatus( '请先完成模型放置，再进行手动微调。' );
			return;
		}

		this.manualRegistration.adjustScale( direction );
		this.reapplyManualPlacement();

	}

	saveManualRegistration(): void {

		if ( this.demoModelConfig === null ) {
			this.setStatus( '模型元数据尚未准备完成。' );
			return;
		}

		if ( this.canUseManualRegistration() === false ) {
			this.setStatus( '请先完成模型放置，再保存手动微调。' );
			return;
		}

		this.refreshActiveManualRegistrationSitePose();
		const sitePose = this.activeManualArSitePose;
		if ( sitePose === null ) {
			this.setStatus( '当前放置结果缺少现场坐标上下文，暂时无法保存。' );
			return;
		}

		const saved = saveResolvedManualRegistrationState(
			this.demoModelConfig.modelId,
			serializeManualArSitePose( sitePose )
		);
		if ( saved === false ) {
			this.setStatus( '手动配准保存失败，请稍后重试。' );
			return;
		}

		this.setStatus( '手动配准已保存。' );
		this.syncRegistrationChainDebug();

	}

	resetManualRegistration(): void {

		if ( this.canUseManualRegistration() === false ) {
			this.setStatus( '当前还没有可重置的微调结果。' );
			return;
		}

		if ( this.demoModelConfig !== null ) {
			clearManualRegistrationState( this.demoModelConfig.modelId );
		}

		this.activeManualArSitePose = null;
		this.hasRestoredManualArSitePose = false;
		this.manualRegistration.reset();
		this.reapplyManualPlacement();
		this.setStatus( '手动微调已重置。' );

	}

	clearSavedRegistration(): boolean {

		if ( this.demoModelConfig === null ) {
			this.setStatus( '模型元数据尚未准备完成。' );
			return false;
		}

		clearManualRegistrationState( this.demoModelConfig.modelId );
		this.activeManualArSitePose = null;
		this.hasRestoredManualArSitePose = false;
		this.manualRegistration.reset();
		this.reapplyManualPlacement();
		this.setStatus( '已清除保存的配准结果。' );
		return true;

	}

	refreshSavedMarkerLocalization(): void {

		this.refreshSavedMarkerLocalizationResult();

	}

	applySavedMarkerLocalizationCorrection(): boolean {

		const savedResult = loadLastStableMarkerLocalizationResult();
		if ( savedResult === null ) {
			this.setStatus( '未找到可用的稳定 Marker 结果。' );
			return false;
		}

		return this.applyMarkerLocalizationCorrection( savedResult );

	}

	applyMarkerLocalizationCorrection(savedResult: SavedMarkerLocalizationResult): boolean {

		if ( this.sceneBundle.renderer.xr.isPresenting === false ) {
			this.setStatus( '请先进入当前 AR 会话，再应用 Marker 校正。' );
			return false;
		}

		if ( this.registrationSolution === null || this.modelTemplate === null ) {
			this.setStatus( '模型工程配准尚未准备完成，暂时无法应用 Marker 校正。' );
			return false;
		}

		const fallbackSolution = this.activeMarkerArFromEnuSolution === null
			? this.getCurrentNonMarkerArFromEnuSolution()
			: this.markerCorrectionFallbackArFromEnuSolution;
		const markerSolution = createArFromEnuSolutionFromSavedMarkerResult( savedResult );

		this.markerCorrectionFallbackArFromEnuSolution = fallbackSolution === null
			? null
			: cloneArFromEnuSolution( fallbackSolution );
		this.activeMarkerArFromEnuSolution = cloneArFromEnuSolution( markerSolution );
		this.activeMarkerLocalizationResult = cloneSavedMarkerLocalizationResult( savedResult );

		const appliedToPlacedModel = this.placementSession.applyArLocalizationSolution( {
			modelTemplate: this.modelTemplate,
			registrationSolution: this.registrationSolution,
			arFromEnuSolution: markerSolution,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation
		} );

		if ( appliedToPlacedModel ) {
			this.applyModelLayerVisibility();
			this.arSessionStateRuntime.markPlacementCommitted( true );
		}

		this.syncRegistrationChainDebug();
		console.info( '[MarkerCorrectionApplied]', {
			markerId: savedResult.markerId,
			markerConfigId: savedResult.markerConfigId ?? null,
			timestamp: savedResult.timestamp,
			ageSeconds: Math.max( 0, ( Date.now() - savedResult.timestamp ) / 1000 ),
			rmsErrorMeters: savedResult.rmsErrorMeters ?? null,
			headingDeg: markerSolution.headingDeg,
			siteOriginArPosition: vector3ToObject( markerSolution.siteOriginArPosition ),
			matrix: markerSolution.matrix.toArray(),
			appliedToPlacedModel
		} );
		this.logRegistrationFinal();
		this.setStatus(
			appliedToPlacedModel
				? 'Marker 校正已应用到当前 AR 放置。'
				: 'Marker 校正已保存，将在本次 AR 会话下一次放置时生效。'
		);
		this.emit();
		return true;

	}

	clearMarkerLocalizationCorrection(): void {

		if ( this.activeMarkerArFromEnuSolution === null ) {
			this.setStatus( '当前没有已应用的 Marker 校正。' );
			return;
		}

		const previousMarkerId = this.activeMarkerLocalizationResult?.markerId ?? null;
		const fallbackSolution = this.getMarkerCorrectionFallbackSolution();
		const fallbackSource = fallbackSolution?.source ?? 'gps-imu';

		this.activeMarkerArFromEnuSolution = null;
		this.activeMarkerLocalizationResult = null;
		this.markerCorrectionFallbackArFromEnuSolution = null;

		if ( fallbackSolution !== null ) {
			const appliedToPlacedModel = this.placementSession.applyArLocalizationSolution( {
				modelTemplate: this.modelTemplate,
				registrationSolution: this.registrationSolution,
				arFromEnuSolution: fallbackSolution,
				manualApplyToPlacement: this.manualRegistration.applyToPlacement,
				manualPositionTarget: this.manualPosition,
				manualOrientationTarget: this.manualOrientation
			} );
			if ( appliedToPlacedModel ) {
				this.applyModelLayerVisibility();
				this.arSessionStateRuntime.markPlacementCommitted( true );
			}
		}

		this.syncRegistrationChainDebug();
		console.info( '[MarkerCorrectionCleared]', {
			previousMarkerId,
			fallbackSource
		} );
		this.logRegistrationFinal();
		this.setStatus( `Marker 校正已清除，当前回退到 ${fallbackSource}。` );
		this.emit();

	}

	clearSavedMarkerLocalization(): void {

		const cleared = clearLastStableMarkerLocalizationResult();
		this.refreshSavedMarkerLocalizationResult( { silentStatus: true } );
		this.setStatus(
			cleared
				? 'Saved marker localization result cleared.'
				: 'No saved marker localization result was available to clear.'
		);

	}

	setManualAdjustmentPreset(preset: ManualAdjustmentPreset): void {

		this.manualRegistration.setAdjustmentPreset( preset );

	}

	setAutoPreviewPlacementEnabled(enabled: boolean): void {

		this.store.patch( { autoPreviewPlacementEnabled: enabled } );
		this.setStatus(
			enabled
				? '已开启面前预览。点击放置时会按当前手机前方预览位置固定到 AR 空间。'
				: '已关闭面前预览。放置时将按真实目标位置固定到 AR 空间。'
		);
		this.emit();

	}

	enterAr(): void {

		if ( this.store.getState().arSupportState !== 'supported' ) {
			this.setStatus( this.store.getState().arSupportMessage );
			return;
		}

		this.pointerSelection.suppressSelectionFor( 1200 );
		this.xrRuntime.requestSession();

	}

	async placeModel(): Promise<void> {

		if ( this.sceneBundle.renderer.xr.isPresenting === false ) {
			this.setStatus( 'AR 会话尚未启动。' );
			return;
		}

		const previewPlacementRequested = this.store.getState().autoPreviewPlacementEnabled;
		if ( previewPlacementRequested === false && this.xrRuntime.getHitTestController().hasGroundHit() === false ) {
			this.setStatus( '请先扫描地面或墙面，再开始放置。' );
			return;
		}

		if ( this.modelTemplate === null || this.registrationSolution === null ) {
			this.setStatus( '模型资源尚未准备完成。' );
			return;
		}

		if (
			previewPlacementRequested === false
			&& this.activeMarkerArFromEnuSolution === null
			&& this.coarseRegistration.canEstimate() === false
		) {
			try {
				this.setStatus( '正在准备粗配准数据。' );
				await this.warmupCoarseRegistration();
				this.setStatus( this.coarseRegistration.getReadyMessage() );
			} catch ( error ) {
				console.error( 'Coarse registration warmup failed:', error );
				this.setStatus(
					error instanceof Error
						? error.message
						: '粗配准准备失败。'
				);
				return;
			}
		}

		if (
			previewPlacementRequested === false
			&& this.activeMarkerArFromEnuSolution === null
			&& this.coarseRegistration.canEstimate() === false
		) {
			this.setStatus( this.coarseRegistration.getMissingRequirementMessage() );
			return;
		}

		this.propertySelection.clearSelection();
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.requestAutoPlacement();
		this.syncArSessionPhase();

		if ( this.placementSession.getPlacedModel() === null ) {
			if ( this.placementSession.getCoarsePlacementPending() ) {
				this.setStatus( '正在执行固定放置...' );
				return;
			}

			this.setStatus( '已识别到平面，但本次放置未完成，请重试。' );
			return;
		}

	}

	exitAr(): void {

		const session = this.sceneBundle.renderer.xr.getSession();
		if ( session === null ) {
			this.setStatus( '当前没有活动中的 AR 会话。' );
			return;
		}

		void session.end();

	}

	saveInspectionRecord(summary: string): void {

		this.setStatus( `已记录核查结果：${summary}` );

	}

	exportInspectionRecords(): void {

		this.setStatus( '核查记录导出暂未接入。' );

	}

	takeSnapshot(): void {

		const result = exportSceneSnapshot( {
			renderer: this.sceneBundle.renderer,
			scene: this.sceneBundle.scene,
			camera: this.sceneBundle.camera,
			modelId: this.demoModelConfig?.modelId ?? null
		} );
		this.setStatus( result.statusMessage );

	}

	toggleAnnotationHelper(label: string): void {

		this.setStatus( label + ' 暂作为工具入口占位。' );

	}

	exportRegistrationSnapshot(): void {

		const state = this.store.getState();
		const result = exportRegistrationSnapshotFile( {
			appMode: state.appMode,
			isPresenting: this.sceneBundle.renderer.xr.isPresenting,
			demoModelConfig: this.demoModelConfig,
			registrationSolution: this.registrationSolution,
			currentStage: state.timelineStages[ state.currentTimelineStageIndex ],
			manualReadout: state.manualReadout,
			placedModel: this.placementSession.getPlacedModel()
		} );
		this.setStatus( result.statusMessage );

	}

	private loadManualRegistration(modelId: string): void {

		const savedState = loadResolvedManualRegistrationState( modelId );
		if ( savedState !== null ) {
			const resolvedSitePose = deserializeManualArSitePose( savedState );
			this.activeManualArSitePose = cloneManualArSitePose( resolvedSitePose );
			this.hasRestoredManualArSitePose = true;
			this.syncManualRegistrationForHeading( 0 );
			this.syncRegistrationChainDebug();
			return;
		}

		this.activeManualArSitePose = null;
		this.hasRestoredManualArSitePose = false;
		this.manualRegistration.setState( {
			offset: new THREE.Vector3(),
			yawDeg: 0,
			scaleMultiplier: 1
		}, { silent: true } );
		this.syncRegistrationChainDebug();

	}

	private syncManualRegistrationForHeading(headingDeg: number): void {

		if ( this.registrationSolution === null || this.activeManualArSitePose === null ) {
			return;
		}

		this.manualRegistration.setState(
			deriveManualRegistrationStateFromArSitePose( {
				sitePose: this.activeManualArSitePose,
				registrationSolution: this.registrationSolution,
				placementHeadingDeg: headingDeg
			} ),
			{ silent: true }
		);

	}

	private refreshActiveManualRegistrationSitePose(): void {

		if ( this.registrationSolution === null ) {
			return;
		}

		const placedModel = this.placementSession.getPlacedModel();
		const placementBase = this.placementSession.getPlacementBase();
		if ( placedModel === null || placementBase === null ) {
			return;
		}

		const sitePose = createManualArSitePoseFromPlacedModel( {
			placedModel,
			placementBase,
			registrationSolution: this.registrationSolution
		} );
		if ( sitePose === null ) {
			this.syncRegistrationChainDebug();
			return;
		}

		this.activeManualArSitePose = cloneManualArSitePose( sitePose );
		this.syncRegistrationChainDebug();

	}

	private emit(): void {

		for ( const listener of this.listeners ) {
			listener();
		}

	}

	private setStatus(message: string): void {

		this.currentStatus = message;
		this.store.patch( { runtimeStatus: message } );

	}

	private syncRegistrationChainDebug(): void {

		const arFromEnuSolution = this.getActiveArFromEnuSolution();
		this.store.patch( {
			registrationChainDebug: {
				engineeringControlRegistration: {
					available: this.registrationSolution !== null,
					controlPointCount: this.registrationSolution?.controlPoints.length ?? 0,
					rmsText: this.registrationSolution === null
						? '-'
						: `${this.registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m`,
					usesUnitScaleAndPivotOffset: this.registrationSolution !== null
				},
				arSessionLocalization: {
					available: arFromEnuSolution !== null,
					source: arFromEnuSolution?.source ?? 'unknown',
					siteOriginArPositionText: arFromEnuSolution === null
						? '-'
						: formatVector3Text( arFromEnuSolution.siteOriginArPosition ),
					headingDegText: arFromEnuSolution === null
						? '-'
						: `${arFromEnuSolution.headingDeg.toFixed( 3 )}deg`
				},
				manualArSitePose: {
					exists: this.activeManualArSitePose !== null,
					rootSiteEnuText: this.activeManualArSitePose === null
						? '-'
						: formatVector3Text( this.activeManualArSitePose.rootSiteEnu ),
					restored: this.hasRestoredManualArSitePose
				},
				heightPolicy: {
					hitTestGroundYEnabled: true,
					enuGpsVerticalOffsetEnabled: false
				},
				markerEngineering: {
					markerCount: this.demoModelConfig?.markers.length ?? 0,
					markers: ( this.demoModelConfig?.markers ?? [] ).map( ( marker ) => ( {
						markerId: marker.id,
						bindControlPointId: marker.bindControlPointId ?? '-',
						sizeMetersText: `${marker.sizeMeters.toFixed( 3 )}m`,
						resolved: this.resolvedMarkerPosesInEnu.some(
							( pose ) => pose.markerId === marker.id
						)
					} ) )
				}
			}
		} );

	}

	private refreshSavedMarkerLocalizationResult(options?: {
		silentStatus?: boolean;
	}): void {

		const saved = loadLastStableMarkerLocalizationResult();
		if ( saved === null ) {
			this.store.patch( {
				savedMarkerLocalization: createDefaultSavedMarkerLocalizationState()
			} );
			if ( options?.silentStatus !== true ) {
				this.setStatus( 'No saved marker localization result found.' );
			}
			return;
		}

		const stability = (
			typeof saved.stabilityReport === 'object'
			&& saved.stabilityReport !== null
			&& 'stable' in saved.stabilityReport
			&& typeof ( saved.stabilityReport as { stable?: unknown } ).stable === 'boolean'
		)
			? ( saved.stabilityReport as { stable: boolean } ).stable
			: undefined;

		this.store.patch( {
			savedMarkerLocalization: {
				available: true,
				markerId: saved.markerId,
				markerConfigId: saved.markerConfigId,
				timestamp: saved.timestamp,
				ageSeconds: Math.max( 0, Math.round( ( Date.now() - saved.timestamp ) / 1000 ) ),
				rmsErrorMeters: saved.rmsErrorMeters,
				sampleCount: saved.sampleCount,
				headingDeg: saved.headingDeg,
				siteOriginArPosition: saved.siteOriginArPosition,
				stable: stability
			}
		} );

		if ( options?.silentStatus !== true ) {
			this.setStatus( 'Saved marker localization result refreshed.' );
		}

	}

	private getCoarseArFromEnuSolution(): ArFromEnuSolution | null {

		return this.coarseRegistration.getLastArFromEnuSolution?.() ?? null;

	}

	private getActiveArFromEnuSolution(): ArFromEnuSolution | null {

		if ( this.activeMarkerArFromEnuSolution !== null ) {
			return cloneArFromEnuSolution( this.activeMarkerArFromEnuSolution );
		}

		const placedModelSolution = this.deriveCurrentPlacedModelArFromEnuSolution();
		if ( placedModelSolution !== null ) {
			return placedModelSolution;
		}

		const coarseSolution = this.getCoarseArFromEnuSolution();
		return coarseSolution === null ? null : cloneArFromEnuSolution( coarseSolution );

	}

	private getCurrentNonMarkerArFromEnuSolution(): ArFromEnuSolution | null {

		const placedModelSolution = this.deriveCurrentPlacedModelArFromEnuSolution();
		if ( placedModelSolution !== null ) {
			return placedModelSolution;
		}

		const coarseSolution = this.getCoarseArFromEnuSolution();
		return coarseSolution === null ? null : cloneArFromEnuSolution( coarseSolution );

	}

	private getMarkerCorrectionFallbackSolution(): ArFromEnuSolution | null {

		if ( this.markerCorrectionFallbackArFromEnuSolution !== null ) {
			return cloneArFromEnuSolution( this.markerCorrectionFallbackArFromEnuSolution );
		}

		const coarseSolution = this.getCoarseArFromEnuSolution();
		return coarseSolution === null ? null : cloneArFromEnuSolution( coarseSolution );

	}

	private deriveCurrentPlacedModelArFromEnuSolution(): ArFromEnuSolution | null {

		const placedModel = this.placementSession.getArPlacedModel();
		const placementBase = this.placementSession.getPlacementBase();
		if (
			this.sceneBundle.renderer.xr.isPresenting === false
			|| placedModel === null
			|| placementBase?.siteContext === undefined
			|| this.registrationSolution === null
		) {
			return null;
		}

		placedModel.updateMatrixWorld( true );
		placedModel.getWorldPosition( tempDerivedArPosition );
		placedModel.getWorldQuaternion( tempDerivedArOrientation );
		placedModel.getWorldScale( tempDerivedArScale );

		tempDerivedArOrientation.multiply(
			tempInverseModelToSiteRotation.copy( this.registrationSolution.modelToSite.rotation ).invert()
		);

		const siteOriginArPosition = tempDerivedArPosition.clone().sub(
			tempSiteTranslationInAr
				.copy( this.registrationSolution.modelToSite.translation )
				.applyQuaternion( tempDerivedArOrientation )
		);
		const hasManualSitePose = this.manualRegistration.hasAdjustments() || this.activeManualArSitePose !== null;
		const fallbackSource = placementBase.siteContext.source
			?? this.getCoarseArFromEnuSolution()?.source
			?? 'gps-imu';

		return createArFromEnuSolution( {
			position: siteOriginArPosition,
			orientation: tempDerivedArOrientation.clone(),
			headingDeg: extractHeadingDegFromEnuOrientation( tempDerivedArOrientation ),
			source: hasManualSitePose ? 'manual-site-pose' : fallbackSource,
			accuracyMeters: placementBase.siteContext.accuracyMeters,
			timestamp: placementBase.siteContext.timestamp ?? Date.now()
		} );

	}

	private resetMarkerLocalizationCorrection(): void {

		this.activeMarkerArFromEnuSolution = null;
		this.activeMarkerLocalizationResult = null;
		this.markerCorrectionFallbackArFromEnuSolution = null;

	}

	private logRegistrationFinal(): void {

		const arFromEnuSolution = this.getActiveArFromEnuSolution();
		const placedModel = this.placementSession.getArPlacedModel();
		placedModel?.updateMatrixWorld( true );
		console.info( '[RegistrationFinal]', {
			currentArLocalizationSource: this.store.getState().registrationChainDebug.arSessionLocalization.source,
			arFromEnuSource: arFromEnuSolution?.source ?? 'unknown',
			modelRootMatrix: placedModel === null ? null : placedModel.matrixWorld.toArray()
		} );

	}

	private updateCoarseLocationDebugText(): void {

		const debugSnapshot = this.coarseRegistration.getDebugSnapshot();
		const displayTargetGeodetic = this.getModelDebugGeodeticTarget() ?? debugSnapshot.targetGeodetic;
		const displayDistanceMeters = this.getDisplayTargetDistanceMeters(
			debugSnapshot.currentGeodetic,
			displayTargetGeodetic
		) ?? debugSnapshot.distanceMeters;
		const currentText = debugSnapshot.currentGeodetic === null
			? '手机 未获取'
			: `手机 ${formatGeodetic(
				debugSnapshot.currentGeodetic.lat,
				debugSnapshot.currentGeodetic.lon,
				debugSnapshot.currentGeodetic.alt
			)}`;
		const targetText = displayTargetGeodetic === null
			? '目标 --'
			: `目标 ${formatGeodetic(
				displayTargetGeodetic.lat,
				displayTargetGeodetic.lon,
				displayTargetGeodetic.alt
			)}`;
		const accuracyText = debugSnapshot.accuracyMeters === null
			? '精度 --'
			: `精度 ${Math.round( debugSnapshot.accuracyMeters )}m`;
		const distanceText = displayDistanceMeters === null
			? '距离 --'
			: `距离 ${Math.round( displayDistanceMeters )}m`;

		this.store.patch( {
			coarseLocationDebugText: `${currentText} / ${targetText} / ${accuracyText} / ${distanceText}`
		} );

	}

	private resolveConfiguredMarkerPoses(config: DemoModelConfig): MarkerPoseInEnu[] {

		return config.markers.flatMap( ( marker ) => {
			try {
				return [ resolveMarkerPoseInEnu( config, marker.id ) ];
			} catch ( error ) {
				console.warn(
					`Failed to resolve marker engineering pose for ${marker.id}:`,
					error
				);
				return [];
			}
		} );

	}

	private getModelDebugGeodeticTarget(): GeodeticCoordinate | null {

		return this.currentModelDebugTargetGeodetic;

	}

	private getDisplayTargetDistanceMeters(
		currentGeodetic: GeodeticCoordinate | null,
		targetGeodetic: GeodeticCoordinate | null
	): number | null {

		if ( currentGeodetic === null || targetGeodetic === null ) {
			return null;
		}

		const currentEnuFrame = createEnuFrame( currentGeodetic );
		return geodeticToEnu( targetGeodetic, currentEnuFrame ).length();

	}

	private appendLog(message: string): void {

		const currentLogs = this.store.getState().logMessages;
		if ( currentLogs[ 0 ]?.endsWith( message ) ) {
			return;
		}

		const timestamp = new Date().toLocaleTimeString( 'zh-CN', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		} );
		this.store.patch( {
			logMessages: [ `[${timestamp}] ${message}`, ...currentLogs ].slice( 0, MAX_LOG_ITEMS )
		} );

	}

	private requestAutoPlacement(): void {

		this.placementSession.requestAutoPlacement( this.modelTemplate );
		this.onAttemptCoarsePlacement();

	}

	private onAttemptCoarsePlacement(): void {

		const hadPlacedModel = this.placementSession.getPlacedModel() !== null;
		this.placementSession.attemptCoarsePlacement( {
			xrHitTest: this.xrRuntime.getHitTestController(),
			modelTemplate: this.modelTemplate,
			registrationSolution: this.registrationSolution,
			arFromEnuSolutionOverride: this.activeMarkerArFromEnuSolution,
			coarseRegistration: this.coarseRegistration,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation,
			modelOrientationTarget: this.modelOrientation,
			cameraWorldPosition: this.cameraWorldPosition,
			onPlacementBaseResolved: ( base ) => {
				this.syncManualRegistrationForHeading( base.siteContext?.headingDeg ?? 0 );
			}
		} );
		this.refreshActiveManualRegistrationSitePose();
		this.applyModelLayerVisibility();
		this.syncRegistrationChainDebug();

		const placedModel = this.placementSession.getPlacedModel();
		if ( hadPlacedModel === false && placedModel !== null ) {
			this.handlePlacementCompleted();
		}

		this.syncArSessionPhase();
		this.emit();

	}

	private async warmupCoarseRegistration(): Promise<void> {

		if ( this.coarseRegistration.canEstimate() ) {
			return;
		}

		if ( this.coarseWarmupPromise !== null ) {
			return this.coarseWarmupPromise;
		}

		this.coarseWarmupPromise = this.coarseRegistration.enable()
			.finally( () => {
				this.coarseWarmupPromise = null;
			} );

		return this.coarseWarmupPromise;

	}

	private handleXRSessionStart(): void {

		this.resetMarkerLocalizationCorrection();
		this.arSessionStateRuntime.handleSessionStart();
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.placementSession.resetPlacement();
		this.refreshActiveManualRegistrationSitePose();
		this.syncArSessionPhase();
		this.syncRegistrationChainDebug();
		this.syncSceneHost();
		void this.warmupCoarseRegistration().catch( ( error ) => {
			console.error( 'Coarse registration warmup after session start failed:', error );
			this.appendLog( 'AR 启动后粗配准预热失败。' );
			this.updateCoarseLocationDebugText();
		} );
		this.emit();

	}

	private handleXRSessionEnd(): void {

		this.resetMarkerLocalizationCorrection();
		this.arSessionStateRuntime.handleSessionEnd();
		this.placementSession.resetPlacement();
		this.syncManualRegistrationForHeading( 0 );
		this.ensureDesktopPreviewPlacement();
		this.syncRegistrationChainDebug();
		this.syncSceneHost();
		this.placementSession.fitDesktopPreviewToCamera();
		this.emit();
		this.schedulePostSessionRecovery();

	}

	private schedulePostSessionRecovery(): void {

		const recover = (): void => {

			if ( this.disposed || this.sceneBundle.renderer.xr.isPresenting ) {
				return;
			}

			this.syncSceneHost();
			this.placementSession.fitDesktopPreviewToCamera();
			this.emit();

		};

		window.setTimeout( recover, 0 );
		window.requestAnimationFrame( recover );
		window.setTimeout( recover, 120 );

	}

	private handlePlacementCompleted(): void {

		this.arSessionStateRuntime.markPlacementCommitted( true );
		if ( this.store.getState().workspaceMode !== 'browse' ) {
			this.store.patch( { workspaceMode: 'browse' } );
		}
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.syncSceneHost();
		this.setStatus( '模型已放置，已切换到浏览模式。' );

	}

	private ensureDesktopPreviewPlacement(): void {

		this.syncManualRegistrationForHeading( 0 );
		this.placementSession.ensureDesktopPreviewPlacement( {
			modelTemplate: this.modelTemplate,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation,
			registrationSolution: this.registrationSolution
		} );
		this.refreshActiveManualRegistrationSitePose();
		this.applyModelLayerVisibility();

	}

	private reapplyManualPlacement(): void {

		this.placementSession.reapplyManualRegistration( {
			modelTemplate: this.modelTemplate,
			registrationSolution: this.registrationSolution,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation
		} );
		this.refreshActiveManualRegistrationSitePose();
		this.applyModelLayerVisibility();

		if ( this.sceneBundle.renderer.xr.isPresenting && this.placementSession.getPlacedModel() !== null ) {
			this.arSessionStateRuntime.markPlacementCommitted( true );
		}

		this.syncArSessionPhase();
		this.syncSceneHost();
		this.emit();

	}

	private syncSceneHost(): void {

		this.sceneBundle.previewModelAnchor.visible = this.sceneBundle.renderer.xr.isPresenting === false;
		this.sceneBundle.arPlacementAnchor.visible = this.sceneBundle.renderer.xr.isPresenting;
		this.sceneBundle.arModelAnchor.visible = this.sceneBundle.renderer.xr.isPresenting;
		this.syncAttachmentInfoBoardVisibility();
		this.sceneHostRuntime.sync( {
			isDesktopLayout: this.isDesktopLayout,
			appMode: this.store.getState().appMode
		} );

	}

	private canUseManualRegistration(): boolean {

		return this.placementSession.getPlacedModel() !== null;

	}

	private syncDisplayModeState(): void {

		const currentMode = this.store.getState().displayMode;
		const placedModel = this.placementSession.getPlacedModel();
		if ( this.lastSyncedDisplayMode === currentMode && this.lastSyncedDisplayModeRoot === placedModel ) {
			return;
		}

		this.lastSyncedDisplayMode = currentMode;
		this.lastSyncedDisplayModeRoot = placedModel;
		if ( placedModel === null ) {
			this.displayModeController.sync( currentMode );
			return;
		}

		preserveRootTransform( placedModel, () => {
			this.displayModeController.sync( currentMode );
		} );

	}

	private syncVisualizationState(): void {

		const state = this.store.getState();
		const modelRoot = state.appMode === 'ar-session'
			? this.placementSession.getArPlacedModel()
			: null;
		const currentValue = getDisplayModeSliderValue( state );
		const signature = [
			state.appMode,
			state.displayMode,
			currentValue,
			state.sectionCutPlaneMode,
			modelRoot?.uuid ?? 'none',
			state.modelLayers.map( ( layer ) => `${layer.id}:${layer.visible ? '1' : '0'}` ).join( '|' )
		].join( '::' );
		if ( signature === this.lastVisualizationSignature ) {
			return;
		}

		this.lastVisualizationSignature = signature;
		this.restoreVisualizationControllers( state.displayMode );

		switch ( state.displayMode ) {
			case 'transparent-xray': {
				const report = this.structureRevealController.apply( {
					modelRoot,
					value: state.transparentXrayValue,
					modelLayers: state.modelLayers
				} );
				console.info( '[LayerXray]', {
					value: report.value,
					opacityMode: report.opacityMode,
					totalLayerCount: report.totalLayerCount,
					affectedMeshCount: report.affectedMeshCount,
					affectedMaterialCount: report.affectedMaterialCount,
					hasModelRoot: report.hasModelRoot
				} );
				if ( report.opacityMode === 'layered' ) {
					for ( const layerReport of report.layerReports ) {
						console.info( '[LayerXrayLayer]', {
							layerId: layerReport.layerId,
							layerIndex: layerReport.layerIndex,
							layerName: layerReport.layerName,
							opacity: layerReport.opacity,
							visible: layerReport.visible
						} );
					}
				}
				break;
			}
			case 'layer-peeling': {
				const report = this.layerPeelingController.apply( state.layerPeelingValue, state.modelLayers );
				console.info( '[LayerPeeling]', {
					value: report.value,
					totalLayerCount: report.totalLayerCount,
					hiddenLayerCount: report.hiddenLayerCount,
					visibleLayerCount: report.visibleLayerCount,
					hiddenLayerIds: report.hiddenLayerIds,
					visibleLayerIds: report.visibleLayerIds
				} );
				break;
			}
			case 'section-cut': {
				this.sectionCutController.setPlaneMode( state.sectionCutPlaneMode );
				const report = this.sectionCutController.apply( modelRoot, state.sectionCutValue );
				console.info( '[SectionCut]', {
					value: report.value,
					planeMode: report.planeMode,
					axis: report.axis,
					axisMin: report.axisMin,
					axisMax: report.axisMax,
					cutPosition: report.cutPosition,
					meaning: report.meaning,
					affectedMeshCount: report.affectedMeshCount,
					affectedMaterialCount: report.affectedMaterialCount
				} );
				break;
			}
			default:
				break;
		}

	}

	private syncAnnotationLabels(): void {

		const state = this.store.getState();
		const placedModel = state.appMode === 'ar-session'
			&& state.arSessionPhase === 'placed'
			? this.placementSession.getArPlacedModel()
			: null;
		const signature = [
			state.appMode,
			state.arSessionPhase,
			placedModel?.uuid ?? 'none',
			state.modelLayers.map( ( layer ) => `${layer.id}:${layer.visible ? '1' : '0'}` ).join( '|' )
		].join( '::' );
		if ( signature === this.lastAnnotationLabelsSignature ) {
			return;
		}

		this.lastAnnotationLabelsSignature = signature;
		if ( placedModel === null ) {
			this.annotationLabelsController.clear();
			this.clearAnnotationDetail();
			console.info( '[ArAnnotationLabels]', {
				labelCount: 0,
				source: 'terrain-layer',
				modelPlaced: false,
				visible: false
			} );
			return;
		}

		const items = this.buildAnnotationItemsForPlacedModel( placedModel );
		this.annotationLabelsController.setItems( items );
		console.info( '[ArAnnotationLabels]', {
			labelCount: items.length,
			source: 'terrain-layer',
			modelPlaced: true,
			visible: items.length > 0
		} );

	}

	private buildAnnotationItemsForPlacedModel(placedModel: THREE.Group): ArAnnotationItem[] {

		const items: ArAnnotationItem[] = [];
		for ( const layer of this.store.getState().modelLayers ) {
			const targetObject = findLayerObjectById( placedModel, layer.id );
			if ( targetObject === null || targetObject.visible === false ) {
				continue;
			}

			const businessName = getBusinessNameFromObject( targetObject );
			const properties = businessName.length > 0
				? this.pipesByName.get( businessName ) ?? null
				: null;
			items.push( {
				id: layer.id,
				title: layer.label,
				subtitle: `terrain-layer #${layer.orderIndex + 1}`,
				description: properties?.remark,
				layerName: layer.label,
				objectName: targetObject.name || businessName,
				properties: properties === null ? undefined : recordToAnnotationProperties( properties ),
				targetObject
			} );
		}

		return items;

	}

	private handleAnnotationSelection(item: ArAnnotationItem): void {

		const businessName = getBusinessNameFromObject( item.targetObject );
		const properties = businessName.length > 0
			? this.pipesByName.get( businessName ) ?? null
			: null;
		this.propertySelection.selectBusinessObject( item.targetObject, properties );
		this.updateAnnotationDetailFromSelection( item.targetObject, properties, item.layerName );
		console.info( '[ArAnnotationSelected]', {
			id: item.id,
			title: item.title,
			objectName: item.objectName ?? item.targetObject.name,
			layerName: item.layerName ?? ''
		} );
		this.setStatus( `已选择 ${item.title}。` );
		this.emit();

	}

	private updateAnnotationDetailFromSelection(
		businessObject: THREE.Object3D,
		properties: PipeRecord | null,
		preferredLayerName?: string
	): void {

		const detailState = this.createAnnotationDetailState(
			businessObject,
			properties,
			preferredLayerName
		);
		this.store.patch( {
			annotationDetail: detailState
		} );
		this.annotationLabelsController.setDetail(
			this.createAnnotationDetailOverlay( businessObject, detailState )
		);

	}

	private clearAnnotationDetail(): void {

		const current = this.store.getState().annotationDetail;
		if ( current.visible === false && current.fields.length === 0 ) {
			return;
		}

		this.store.patch( { annotationDetail: createDefaultAnnotationDetailState() } );
		this.annotationLabelsController.setDetail( null );

	}

	private createAnnotationDetailState(
		businessObject: THREE.Object3D,
		properties: PipeRecord | null,
		preferredLayerName?: string
	): AnnotationDetailState {

		const bounds = new THREE.Box3().setFromObject( businessObject );
		const center = bounds.getCenter( new THREE.Vector3() );
		const size = bounds.getSize( new THREE.Vector3() );
		const materialName = getObjectMaterialName( businessObject );
		const layerName = preferredLayerName
			?? getLayerLabelForObject( businessObject, this.store.getState().modelLayers )
			?? '未分层';
		const thickness = properties?.diameter
			?? `${size.y.toFixed( 2 )}m`;
		const remark = properties?.remark
			?? `尺寸 ${size.x.toFixed( 2 )} x ${size.y.toFixed( 2 )} x ${size.z.toFixed( 2 )}m`;

		return {
			visible: true,
			title: properties?.name ?? ( getBusinessNameFromObject( businessObject ) || businessObject.name || '未命名构件' ),
			subtitle: layerName,
			fields: [
				{ label: '类型', value: properties?.type || businessObject.type || '-' },
				{ label: '材料', value: properties?.material || materialName || '-' },
				{ label: '高程', value: `${center.y.toFixed( 2 )}m` },
				{ label: '厚度', value: thickness },
				{ label: '状态', value: properties?.status || ( businessObject.visible ? '可见' : '隐藏' ) },
				{ label: '备注', value: remark }
			]
		};

	}

	private createAnnotationDetailOverlay(
		targetObject: THREE.Object3D,
		detailState: AnnotationDetailState
	): ArAnnotationDetailOverlay | null {

		if ( detailState.visible === false || detailState.fields.length === 0 ) {
			return null;
		}

		return {
			targetObject,
			title: detailState.title,
			subtitle: detailState.subtitle,
			fields: detailState.fields
		};

	}

	private syncArSessionPhase(): void {

		this.arSessionStateRuntime.syncPhase();

	}

	private updateTargetGuidance(): void {

		const nextGuidance = this.sceneBundle.renderer.xr.isPresenting
			&& this.store.getState().autoPreviewPlacementEnabled === false
			? computeTargetGuidanceState(
				this.placementSession.getPlacedModel(),
				this.sceneBundle.renderer.xr.getCamera()
			)
			: createDefaultTargetGuidanceState();
		const nextSignature = nextGuidance.visible
			? `${nextGuidance.alignment}|${nextGuidance.directionText}|${nextGuidance.distanceText}|${nextGuidance.detailText}`
			: 'hidden';

		if ( nextSignature === this.targetGuidanceSignature ) {
			return;
		}

		this.targetGuidanceSignature = nextSignature;
		this.store.patch( { targetGuidance: nextGuidance } );

	}

	private bindArSelectionSession = (): void => {

		const session = this.sceneBundle.renderer.xr.getSession();
		session?.addEventListener( 'select', this.pointerSelection.handleArSelect );

	};

	private unbindArSelectionSession = (): void => {

		const session = this.sceneBundle.renderer.xr.getSession();
		session?.removeEventListener( 'select', this.pointerSelection.handleArSelect );

	};

	private shouldHandleGlobalArPointerEvent(event: PointerEvent): boolean {

		if ( this.sceneBundle.renderer.xr.isPresenting === false ) {
			return false;
		}

		const target = event.target;
		if ( target instanceof Element ) {
			return target.closest( '[data-ar-ui="true"]' ) === null;
		}

		return true;

	}

	private handleGlobalArPointerDown = (event: PointerEvent): void => {

		if ( this.shouldHandleGlobalArPointerEvent( event ) === false ) {
			return;
		}

		this.pointerSelection.handleScreenPointerDown( event.clientX, event.clientY );

	};

	private handleGlobalArPointerUp = (event: PointerEvent): void => {

		if ( this.shouldHandleGlobalArPointerEvent( event ) === false ) {
			return;
		}

		this.pointerSelection.handleScreenPointerUp( event.clientX, event.clientY );

	};

	private handleWindowResize = (): void => {

		this.sceneHostRuntime.resize();
		if ( this.isDesktopLayout || this.store.getState().appMode === 'pre-ar' ) {
			this.placementSession.fitDesktopPreviewToCamera();
		}

	};

	private rebuildModelLayers(): void {

		this.layerVisibility.rebuild( {
			modelRoot: this.modelTemplate,
			pipesByName: this.pipesByName
		} );
		if ( this.store.getState().displayMode === 'layer-peeling' ) {
			this.layerVisibility.setHiddenLayerCount(
				percentToHiddenLayerCount(
					this.store.getState().layerPeelingValue,
					this.layerVisibility.getState().length
				)
			);
		}
		const modelLayers = this.layerVisibility.getState();
		this.store.patch( {
			layerNames: modelLayers.length > 0
				? modelLayers.map( ( layer ) => layer.label )
				: STATIC_LAYER_NAMES,
			modelLayers
		} );

	}

	private applyModelLayerVisibility(): void {

		this.layerVisibility.applyToRoot( this.placementSession.getPreviewPlacedModel() );
		this.layerVisibility.applyToRoot( this.placementSession.getArPlacedModel() );
		this.syncAttachmentInfoBoardVisibility();
		this.displayModeController.captureMaterialBaseline();
		this.structureRevealController.captureVisibilityBaseline( this.placementSession.getArPlacedModel() );
		this.lastSyncedDisplayMode = null;
		this.lastSyncedDisplayModeRoot = null;
		const modelLayers = this.layerVisibility.getState();
		this.store.patch( {
			layerNames: modelLayers.length > 0
				? modelLayers.map( ( layer ) => layer.label )
				: STATIC_LAYER_NAMES,
			modelLayers
		} );
		this.syncDisplayModeState();
		this.syncVisualizationState();

	}

	private syncLayerPeelingValueFromLayers(): void {

		const layers = this.layerVisibility.getState();
		const nextValue = hiddenLayerCountToPercent( countHiddenLayers( layers ), layers.length );
		const patch: Partial<RegistrationStoreState> = {
			layerPeelingValue: nextValue
		};
		if ( this.store.getState().displayMode === 'layer-peeling' ) {
			patch.structureRevealValue = nextValue;
		}
		this.store.patch( patch );

	}

	private restoreVisualizationControllers(activeMode?: ArDisplayMode): void {

		if ( activeMode !== 'transparent-xray' ) {
			this.structureRevealController.restore();
		}
		if ( activeMode !== 'layer-peeling' ) {
			this.layerPeelingController.restore();
		}
		if ( activeMode !== 'section-cut' ) {
			this.sectionCutController.restore();
		}

	}

	private syncAttachmentInfoBoardVisibility(): void {

		setAttachmentInfoBoardVisibility( this.placementSession.getPreviewPlacedModel(), false );
		setAttachmentInfoBoardVisibility(
			this.placementSession.getArPlacedModel(),
			this.sceneBundle.renderer.xr.isPresenting
		);

	}

}

function cloneManualArSitePose(
	sitePose: ManualArSitePose
): ManualArSitePose {

	return {
		rootSiteEnu: sitePose.rootSiteEnu.clone(),
		rootWorldGeodetic: { ...sitePose.rootWorldGeodetic },
		rootYawDeg: sitePose.rootYawDeg,
		scaleMultiplier: sitePose.scaleMultiplier,
		updatedAt: sitePose.updatedAt
	};

}

function formatVector3Text(vector: THREE.Vector3): string {

	return `${vector.x.toFixed( 3 )}, ${vector.y.toFixed( 3 )}, ${vector.z.toFixed( 3 )}`;

}

function cloneArFromEnuSolution(solution: ArFromEnuSolution): ArFromEnuSolution {

	return {
		matrix: solution.matrix.clone(),
		siteOriginArPosition: solution.siteOriginArPosition.clone(),
		orientation: solution.orientation.clone(),
		headingDeg: solution.headingDeg,
		source: solution.source,
		accuracyMeters: solution.accuracyMeters,
		yawAccuracyDegrees: solution.yawAccuracyDegrees,
		timestamp: solution.timestamp
	};

}

function cloneSavedMarkerLocalizationResult(
	savedResult: SavedMarkerLocalizationResult
): SavedMarkerLocalizationResult {

	return {
		...savedResult,
		matrix: savedResult.matrix instanceof THREE.Matrix4
			? savedResult.matrix.clone()
			: [ ...savedResult.matrix ],
		siteOriginArPosition: savedResult.siteOriginArPosition === undefined
			? undefined
			: { ...savedResult.siteOriginArPosition }
	};

}

function vector3ToObject(vector: THREE.Vector3): { x: number; y: number; z: number } {

	return {
		x: vector.x,
		y: vector.y,
		z: vector.z
	};

}

function findLayerObjectById(root: THREE.Object3D, layerId: string): THREE.Object3D | null {

	let resolved: THREE.Object3D | null = null;
	root.traverse( ( child ) => {
		if ( resolved !== null ) {
			return;
		}

		if ( child.userData.__layerId === layerId && child.userData.__layerSelectable === true ) {
			resolved = child;
		}
	} );

	return resolved;

}

function getBusinessNameFromObject(object: THREE.Object3D | null): string {

	if ( object === null ) {
		return '';
	}

	const businessName = object.userData.__businessName;
	if ( typeof businessName === 'string' && businessName.length > 0 ) {
		return businessName;
	}

	return object.name || '';

}

function getObjectMaterialName(root: THREE.Object3D): string {

	let resolvedMaterialName = '';
	root.traverse( ( child ) => {
		if ( resolvedMaterialName.length > 0 || ( child instanceof THREE.Mesh ) === false ) {
			return;
		}

		if ( Array.isArray( child.material ) ) {
			const names = child.material
				.map( ( material ) => material.name )
				.filter( ( name ) => name.length > 0 );
			resolvedMaterialName = names.join( ', ' );
			return;
		}

		resolvedMaterialName = child.material.name || '';
	} );

	return resolvedMaterialName || '-';

}

function getLayerLabelForObject(
	object: THREE.Object3D,
	layers: readonly RegistrationStoreState['modelLayers']
): string | null {

	let current: THREE.Object3D | null = object;
	while ( current !== null ) {
		const layerId = current.userData.__layerId;
		if ( typeof layerId === 'string' ) {
			return layers.find( ( layer ) => layer.id === layerId )?.label ?? layerId;
		}
		current = current.parent;
	}

	return null;

}

function recordToAnnotationProperties(record: PipeRecord): Record<string, string | number> {

	return {
		name: record.name,
		type: record.type ?? '-',
		diameter: record.diameter ?? '-',
		material: record.material ?? '-',
		depth: record.depth ?? '-',
		status: record.status ?? '-',
		remark: record.remark ?? '-'
	};

}

function extractHeadingDegFromEnuOrientation(orientation: THREE.Quaternion): number {

	tempNorthVectorInAr.set( 0, 1, 0 ).applyQuaternion( orientation );
	return normalizeDegrees(
		THREE.MathUtils.radToDeg( Math.atan2( - tempNorthVectorInAr.x, - tempNorthVectorInAr.z ) )
	);

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}

function countHiddenLayers(layers: Array<{ visible: boolean }>): number {

	return layers.reduce( ( count, layer ) => count + ( layer.visible ? 0 : 1 ), 0 );

}

function percentToHiddenLayerCount(value: number, totalLayerCount: number): number {

	const maxHideCount = Math.max( 0, totalLayerCount - 1 );
	if ( maxHideCount === 0 ) {
		return 0;
	}

	return Math.round( THREE.MathUtils.clamp( value, 0, 100 ) / 100 * maxHideCount );

}

function hiddenLayerCountToPercent(hiddenLayerCount: number, totalLayerCount: number): number {

	const maxHideCount = Math.max( 0, totalLayerCount - 1 );
	if ( maxHideCount === 0 ) {
		return 0;
	}

	return Math.round( THREE.MathUtils.clamp( hiddenLayerCount, 0, maxHideCount ) / maxHideCount * 100 );

}

function getDisplayModeSliderValue(
	state: RegistrationStoreState,
	mode: ArDisplayMode = state.displayMode
): number {

	switch ( mode ) {
		case 'transparent-xray':
			return state.transparentXrayValue;
		case 'layer-peeling':
			return state.layerPeelingValue;
		case 'section-cut':
			return state.sectionCutValue;
		default:
			return 0;
	}

}







