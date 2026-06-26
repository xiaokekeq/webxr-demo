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
import { createMeasurementController } from './internal/tools/measurement-controller.js';
import type { DemoModelConfig } from '../data/demo-model-config.js';
import {
	createDefaultMeasurementState,
	createDefaultTargetGuidanceState,
	createRegistrationStore,
	type DisplayMode,
	type MeasurementMode,
	type RegistrationStore,
	type RegistrationStoreState,
	type WorkspaceMode
} from '../registration/registration-store.js';
import {
	composeModelQuaternionInAr,
	createCoarseTargetFromEngineeringSolution,
	type EngineeringRegistrationSolution
} from '../registration/engineering-registration.js';
import { createCoarseRegistrationController } from '../registration/coarse-registration.js';
import {
	createManualRegistrationController,
	type ManualAdjustmentPreset
} from '../registration/manual-registration.js';
import { createPrecisionRegistrationController } from '../registration/precision-registration-controller.js';
import { createDisplayModeController, preserveRootTransform } from './display-mode.js';
import { computeTargetGuidanceState } from './internal/placement/target-guidance.js';
import { createARScene, resizeARScene } from './scene.js';
import { createXRSessionRuntime } from './xr.js';
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
		displayMode: 'normal',
		timelineStages: TIMELINE_STAGES,
		currentTimelineStageIndex: 2,
		layerNames: STATIC_LAYER_NAMES,
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
		placementSummary: {
			positionText: '-',
			quaternionText: '-',
			scaleText: '-'
		},
		targetGuidance: createDefaultTargetGuidanceState(),
		precisionRegistration: {
			availableSourcePoints: [],
			selectedSourcePoint: '',
			stagedSourcePoint: '未选择',
			stagedTargetPoint: '未确认',
			targetQualityText: '尚未采样',
			lastCapturedSourcePoint: '暂无',
			lastCapturedTargetPoint: '暂无',
			lastCapturedQualityText: '暂无',
			pairSummaries: [],
			pairResidualSummaries: [],
			rmsText: '--',
			workflowStatusText: '完成粗配准后可继续采集控制点。',
			feedbackText: '',
			feedbackTone: 'neutral',
			feedbackUpdatedAt: '',
			isSourceLocked: false,
			hasConfirmedTarget: false
		},
		measurement: createDefaultMeasurementState(),
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

function getDisplayModeLabel(mode: DisplayMode): string {

	switch ( mode ) {
		case 'normal':
			return '普通叠加';
		case 'xray':
			return '透视核查';
		case 'occlusion-outline':
			return '遮挡辅助';
	}

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
	private readonly propertySelection;
	private readonly placementSession;
	private readonly modelSession;
	private readonly xrRuntime;
	private readonly manualReadoutSync;
	private readonly manualRegistration;
	private readonly precisionRegistration;
	private readonly measurementController;
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

		this.precisionRegistration = createPrecisionRegistrationController( {
			store: this.store,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			getPlacedModel: () => this.placementSession.getPlacedModel(),
			getCurrentModelId: () => this.demoModelConfig?.modelId ?? null,
			getTargetPoint: ( target ) => this.xrRuntime.getHitTestController().getHitPosition( target ),
			getTargetPointQuality: () => this.xrRuntime.getHitTestController().getHitTestQuality(),
			onApplied: ( result ) => {
				this.placementSession.applyPrecisionRegistrationResult( result );
				if ( this.manualRegistration.hasAdjustments() ) {
					this.reapplyManualPlacement();
					return;
				}
				this.syncArSessionPhase();
				this.emit();
			}
		} );

		this.measurementController = createMeasurementController( {
			store: this.store,
			scene: this.sceneBundle.scene,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
			},
			getTargetPoint: ( target ) => this.xrRuntime.getHitTestController().getHitPosition( target ),
			getTargetPointQuality: () => this.xrRuntime.getHitTestController().getHitTestQuality()
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
			hasPlacedModel: () => this.placementSession.getPlacedModel() !== null,
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
				if ( this.store.getState().workspaceMode !== 'browse' ) {
					this.store.patch( { workspaceMode: 'browse' } );
				}
				this.emit();
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
				this.pipesByName = new Map<string, PipeRecord>();
			},
			onRuntimeBundleLoaded: ( bundle ) => {
				this.pipesByName = bundle.pipesByName;
				this.demoModelConfig = bundle.demoModelConfig;
				this.modelTemplate = bundle.modelTemplate;
				this.registrationSolution = bundle.registrationSolution;
			},
			onAfterModelLoaded: () => {
				this.ensureDesktopPreviewPlacement();
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
			},
			onLoadManualRegistration: ( modelId ) => {
				this.manualRegistration.load( modelId );
			},
			onLoadPrecisionRegistration: ( modelId ) => {
				this.precisionRegistration.loadSavedResult( modelId );
			},
			onUpdatePrecisionSourcePointOptions: ( sourcePoints ) => {
				this.precisionRegistration.updateSourcePointOptions( sourcePoints );
			},
			canRequestAutoPlacement: () => this.sceneBundle.renderer.xr.isPresenting && this.coarseRegistration.canEstimate(),
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
				this.placementSession.getPlacedModel() === null
				&& this.placementSession.getCoarsePlacementPending() === false
			),
			onAttemptCoarsePlacement: () => {
				this.onAttemptCoarsePlacement();
			},
			onFrameUpdate: () => {
				this.updateTargetGuidance();
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
			this.emit();
		} );

		this.syncDisplayModeState();

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
		this.measurementController.dispose();
		this.sceneBundle.controls.dispose();
		this.sceneBundle.renderer.dispose();

	}

	handleArUiInteraction(): void {

		this.pointerSelection.cancelPendingSelection( 1400 );

	}

	closePropertyPanel(): void {

		this.pointerSelection.suppressSelectionFor( 1000 );
		this.propertySelection.clearSelection();
		this.setStatus( '已关闭构件详情面板。' );

	}

	selectModel(modelId: string): void {

		this.modelSession.handleModelSelection( modelId );

	}

	setDisplayMode(mode: DisplayMode): void {

		if ( mode !== 'normal' && mode !== 'xray' && mode !== 'occlusion-outline' ) {
			return;
		}

		if ( this.canMutatePlacedModelDisplayMode() === false ) {
			this.setStatus( '请先完成模型放置，再切换显示模式。' );
			return;
		}

		if ( this.store.getState().displayMode === mode ) {
			return;
		}

		this.store.patch( { displayMode: mode } );
		this.setStatus( `显示模式已切换为：${getDisplayModeLabel( mode )}` );

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

		this.measurementController.reset();
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

		this.manualRegistration.save( this.demoModelConfig.modelId );
		this.setStatus( '手动配准已保存。' );

	}

	resetManualRegistration(): void {

		if ( this.canUseManualRegistration() === false ) {
			this.setStatus( '当前还没有可重置的微调结果。' );
			return;
		}

		if ( this.demoModelConfig !== null ) {
			this.manualRegistration.clearSaved( this.demoModelConfig.modelId );
		}

		this.manualRegistration.reset();
		this.reapplyManualPlacement();
		this.setStatus( '手动微调已重置。' );

	}

	clearSavedRegistration(): boolean {

		if ( this.demoModelConfig === null ) {
			this.setStatus( '模型元数据尚未准备完成。' );
			return false;
		}

		this.manualRegistration.clearSaved( this.demoModelConfig.modelId );
		this.precisionRegistration.clearSaved( this.demoModelConfig.modelId );
		this.manualRegistration.reset();
		this.reapplyManualPlacement();
		this.setStatus( '已清除保存的配准结果。' );
		return true;

	}

	setManualAdjustmentPreset(preset: ManualAdjustmentPreset): void {

		this.manualRegistration.setAdjustmentPreset( preset );

	}

	setAutoPreviewPlacementEnabled(enabled: boolean): void {

		this.store.patch( { autoPreviewPlacementEnabled: enabled } );
		this.setStatus(
			enabled
				? '已开启近距离预览放置，放置时会优先显示到手机前方。'
				: '已关闭近距离预览放置，将按真实目标位置放置。'
		);
		this.emit();

	}

	selectPrecisionSourcePoint(sourcePoint: string): void {

		this.precisionRegistration.handleSourceSelection( sourcePoint );

	}

	armPrecisionSourcePoint(): void {

		this.precisionRegistration.armSourcePoint();

	}

	confirmPrecisionTargetPoint(): void {

		this.precisionRegistration.confirmTargetPoint();

	}

	cancelPrecisionCapture(): void {

		this.precisionRegistration.cancelStagedPair();

	}

	addPrecisionPair(): void {

		this.precisionRegistration.addPair();

	}

	solvePrecisionRegistration(): void {

		this.precisionRegistration.solve();

	}

	savePrecisionRegistration(): void {

		this.precisionRegistration.save();

	}

	clearPrecisionPairs(): void {

		this.precisionRegistration.clear();

	}

	startMeasurementMode(mode: MeasurementMode): void {

		if ( this.sceneBundle.renderer.xr.isPresenting === false ) {
			this.setStatus( '请先进入 AR 会话，再开始现场测量。' );
			return;
		}

		if ( this.placementSession.getPlacedModel() === null ) {
			this.setStatus( '请先完成模型放置，再开始现场测量。' );
			return;
		}

		this.measurementController.start( mode );

	}

	confirmMeasurementPoint(): void {

		this.measurementController.confirmPoint();

	}

	cancelMeasurement(): void {

		this.measurementController.cancel();

	}

	clearMeasurement(): void {

		this.measurementController.clear();

	}

	removePrecisionPair(index: number): void {

		this.precisionRegistration.removePair( index );

	}

	enterAr(): void {

		if ( this.store.getState().arSupportState !== 'supported' ) {
			this.setStatus( this.store.getState().arSupportMessage );
			return;
		}

		this.pointerSelection.suppressSelectionFor( 1200 );
		void this.warmupCoarseRegistration();
		this.xrRuntime.requestSession();

	}

	async placeModel(): Promise<void> {

		if ( this.sceneBundle.renderer.xr.isPresenting === false ) {
			this.setStatus( 'AR 会话尚未启动。' );
			return;
		}

		if ( this.xrRuntime.getHitTestController().hasGroundHit() === false ) {
			this.setStatus( '请先扫描地面或墙面，再开始放置。' );
			return;
		}

		if ( this.modelTemplate === null || this.registrationSolution === null ) {
			this.setStatus( '模型资源尚未准备完成。' );
			return;
		}

		if ( this.coarseRegistration.canEstimate() === false ) {
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

		if ( this.coarseRegistration.canEstimate() === false ) {
			this.setStatus( this.coarseRegistration.getMissingRequirementMessage() );
			return;
		}

		this.propertySelection.clearSelection();
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.requestAutoPlacement();
		this.syncArSessionPhase();

		if ( this.placementSession.getPlacedModel() === null ) {
			if ( this.placementSession.getCoarsePlacementPending() ) {
				this.setStatus( '正在放置模型...' );
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

	runMeasurementTool(label: string): void {

		switch ( label ) {
			case '两点测距':
				this.startMeasurementMode( 'distance-3d' );
				return;
			case '水平距离':
				this.startMeasurementMode( 'distance-horizontal' );
				return;
			case '深入测量':
				this.startMeasurementMode( 'depth' );
				return;
			case '清除测量':
				this.clearMeasurement();
				return;
			default:
				this.setStatus( `${label} 暂未接入。` );
		}

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

	private emit(): void {

		for ( const listener of this.listeners ) {
			listener();
		}

	}

	private setStatus(message: string): void {

		this.currentStatus = message;
		this.store.patch( { runtimeStatus: message } );

	}

	private updateCoarseLocationDebugText(): void {

		const debugSnapshot = this.coarseRegistration.getDebugSnapshot();
		const currentText = debugSnapshot.currentGeodetic === null
			? '手机 未获取'
			: `手机 ${formatGeodetic(
				debugSnapshot.currentGeodetic.lat,
				debugSnapshot.currentGeodetic.lon,
				debugSnapshot.currentGeodetic.alt
			)}`;
		const targetText = debugSnapshot.targetGeodetic === null
			? '目标 --'
			: `目标 ${formatGeodetic(
				debugSnapshot.targetGeodetic.lat,
				debugSnapshot.targetGeodetic.lon,
				debugSnapshot.targetGeodetic.alt
			)}`;
		const accuracyText = debugSnapshot.accuracyMeters === null
			? '精度 --'
			: `精度 ${Math.round( debugSnapshot.accuracyMeters )}m`;
		const distanceText = debugSnapshot.distanceMeters === null
			? '距离 --'
			: `距离 ${Math.round( debugSnapshot.distanceMeters )}m`;

		this.store.patch( {
			coarseLocationDebugText: `${currentText} / ${targetText} / ${accuracyText} / ${distanceText}`
		} );

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
			coarseRegistration: this.coarseRegistration,
			modelOrientationTarget: this.modelOrientation,
			cameraWorldPosition: this.cameraWorldPosition
		} );

		const placedModel = this.placementSession.getPlacedModel();
		if ( hadPlacedModel === false && placedModel !== null ) {
			this.precisionRegistration.applySavedResult( placedModel );
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

		this.measurementController.reset();
		this.arSessionStateRuntime.handleSessionStart();
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.placementSession.resetPlacement();
		this.syncArSessionPhase();
		this.syncSceneHost();
		this.emit();

	}

	private handleXRSessionEnd(): void {

		this.measurementController.reset();
		this.arSessionStateRuntime.handleSessionEnd();
		this.placementSession.resetPlacement();
		this.ensureDesktopPreviewPlacement();
		this.syncSceneHost();
		this.placementSession.fitDesktopPreviewToCamera();
		this.emit();

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

		this.placementSession.ensureDesktopPreviewPlacement( {
			modelTemplate: this.modelTemplate,
			registrationSolution: this.registrationSolution
		} );

	}

	private reapplyManualPlacement(): void {

		this.placementSession.reapplyManualRegistration( {
			modelTemplate: this.modelTemplate,
			registrationSolution: this.registrationSolution,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation
		} );

		if ( this.sceneBundle.renderer.xr.isPresenting && this.placementSession.getPlacedModel() !== null ) {
			this.arSessionStateRuntime.markPlacementCommitted( true );
		}

		this.syncArSessionPhase();
		this.syncSceneHost();
		this.emit();

	}

	private syncSceneHost(): void {

		this.sceneHostRuntime.sync( {
			isDesktopLayout: this.isDesktopLayout,
			appMode: this.store.getState().appMode
		} );

	}

	private canUseManualRegistration(): boolean {

		return this.placementSession.getPlacedModel() !== null;

	}

	private canMutatePlacedModelDisplayMode(): boolean {

		const state = this.store.getState();
		if ( state.appMode !== 'ar-session' ) {
			return true;
		}

		return this.placementSession.getPlacedModel() !== null;

	}

	private syncDisplayModeState(): void {

		const placedModel = this.placementSession.getPlacedModel();
		if ( placedModel === null ) {
			this.displayModeController.sync( this.store.getState().displayMode );
			return;
		}

		preserveRootTransform( placedModel, () => {
			this.displayModeController.sync( this.store.getState().displayMode );
		} );

	}

	private syncArSessionPhase(): void {

		this.arSessionStateRuntime.syncPhase();

	}

	private updateTargetGuidance(): void {

		const nextGuidance = this.sceneBundle.renderer.xr.isPresenting
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

}







