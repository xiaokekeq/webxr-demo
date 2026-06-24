import * as THREE from 'three';
import type { PipeRecord } from '../../load-model/types.js';
import { createManualReadoutSync } from '../app/interaction/manual-readout.js';
import { createPointerSelectionSession } from '../app/interaction/pointer-selection.js';
import { createModelSession } from '../app/model/session.js';
import { createPlacementSession } from '../app/placement/session.js';
import { createPropertySelectionController } from '../app/interaction/property-selection.js';
import { createStatusRuntime } from '../app/runtime/status-runtime.js';
import { createRegistrationSnapshot } from '../app/runtime/view-state.js';
import { createWorkspaceRuntime } from '../app/runtime/workspace-runtime.js';
import type { DemoModelConfig } from '../data/demo-model-config.js';
import {
	createRegistrationStore,
	type DisplayMode,
	type RegistrationStore,
	type RegistrationStoreState,
	type WorkspaceMode
} from '../data/registration-store.js';
import {
	composeModelQuaternionInAr,
	createCoarseTargetFromEngineeringSolution,
	type EngineeringRegistrationSolution
} from '../registration/engineering-registration.js';
import { createCoarseRegistrationController } from '../registration/coarse-registration.js';
import { createManualRegistrationController } from '../registration/manual-registration.js';
import { createPrecisionRegistrationController } from '../registration/precision-registration-controller.js';
import { createDisplayModeController } from '../render/display-mode.js';
import { createARScene, resizeARScene } from '../render/scene.js';
import { createXRSessionRuntime } from '../xr/session-runtime.js';

const MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS = 8;
const MAX_RELIABLE_GPS_ACCURACY_METERS = 15;
const PREVIEW_PLACEMENT_DISTANCE_METERS = 2.5;
const MAX_LOG_ITEMS = 24;
const DEFAULT_DESKTOP_PREVIEW_BADGE = '3D preview area';
const DESKTOP_PREVIEW_BADGE = '3D preview area / orbit, pan, zoom';
const DESKTOP_PREVIEW_DIRECTION = new THREE.Vector3( 0.85, 0.48, 1 );

const PROJECT_NAME = '堤防现场辅助核查';
const TIMELINE_STAGES = [ '施工前', '基础开挖', '堤身填筑', '护坡施工', '完工核查' ] as const;
const STATIC_LAYER_NAMES = [ '三维模型', '堤身结构', '防渗层', '排水设施', '控制点', '辅助标注' ] as const;

type ArSessionPhase = RegistrationStoreState['arSessionPhase'];

export interface ThreeEngineHosts {
	arCanvasHost: HTMLElement;
	preArCanvasHost: HTMLElement;
	desktopCanvasHost: HTMLElement;
	xrButtonHost: HTMLElement;
}

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
		arSupportMessage: 'Checking AR support...',
		arSessionPhase: 'scanning',
		workspaceMode: 'browse',
		displayMode: 'normal',
		timelineStages: TIMELINE_STAGES,
		currentTimelineStageIndex: 2,
		layerNames: STATIC_LAYER_NAMES,
		pipeList: [],
		propertyPanel: {
			name: 'No component selected',
			statusBadge: 'Waiting',
			type: '-',
			diameter: '-',
			material: '-',
			depth: '-',
			status: '-',
			remark: 'Tap a component in AR to inspect its attributes.'
		},
		manualReadout: {
			positionText: 'Left 0.00m / Up 0.00m / Forward 0.00m',
			yawText: '0deg',
			scaleText: '1.000x'
		},
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
		precisionRegistration: {
			availableSourcePoints: [],
			selectedSourcePoint: '',
			stagedSourcePoint: 'None',
			stagedTargetPoint: 'None',
			pairSummaries: [],
			rmsText: '--',
			workflowStatusText: 'Collect control points after coarse placement.'
		},
		registrationStatusDetail: 'Status: waiting for plane detection',
		runtimeStatus: 'Preparing AR workspace...',
		desktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
		logMessages: []
	};

}

function hasSelectedPipe(state: RegistrationStoreState): boolean {

	return (
		state.propertyPanel.type !== '-'
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

function getWorkspaceModeLabel(mode: WorkspaceMode): string {

	switch ( mode ) {
		case 'browse':
			return '浏览';
		case 'registration':
			return '配准';
		case 'tools':
			return '工具';
		case 'inspection':
			return '核查';
	}

}

function getArSupportMessage(supported: boolean): string {

	return supported
		? '当前设备支持 WebXR AR，确认模型与阶段后即可进入现场模式。'
		: '当前设备不支持 WebXR AR，可以继续查看模型和数据，但无法进入现场 AR 会话。';

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
	private readonly workspaceRuntime;
	private readonly pointerSelection;
	private readonly listeners = new Set<() => void>();

	private hosts: ThreeEngineHosts | null = null;
	private initialized = false;
	private disposed = false;
	private isDesktopLayout = window.matchMedia( '(any-pointer: fine)' ).matches;
	private currentStatus = 'Preparing AR workspace...';
	private modelTemplate: THREE.Group | null = null;
	private demoModelConfig: DemoModelConfig | null = null;
	private registrationSolution: EngineeringRegistrationSolution | null = null;
	private pipesByName = new Map<string, PipeRecord>();
	private hasCommittedArPlacement = false;
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
			onApplied: () => {
				this.syncArSessionPhase();
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

		this.workspaceRuntime = createWorkspaceRuntime( {
			store: this.store,
			setStatus: ( message ) => {
				statusRuntime.setStatus( message );
				this.emit();
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
				const state = this.store.getState();
				if ( state.appMode === 'ar-session' && state.arSessionPhase === 'placed' ) {
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
				this.placementSession.fitDesktopPreviewToCamera();
				this.syncSceneHost();
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
			this.displayModeController.sync( this.store.getState().displayMode );
			this.emit();
		} );

		this.displayModeController.sync( this.store.getState().displayMode );

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

	getRegistrationStore(): RegistrationStore {

		return this.store;

	}

	mount(hosts: ThreeEngineHosts): void {

		this.hosts = hosts;
		if ( this.xrButtonWrap.parentElement !== hosts.xrButtonHost ) {
			hosts.xrButtonHost.appendChild( this.xrButtonWrap );
		}
		this.syncSceneHost();

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
		this.setStatus( 'Preparing AR workspace...' );
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
					this.appendLog( 'Coarse registration sensors are warmed up.' );
				} )
				.catch( () => {
					this.appendLog( 'Coarse registration warmup did not complete automatically.' );
				} );
		} catch ( error ) {
			console.error( 'AR engine initialization failed:', error );
			this.setStatus(
				error instanceof Error ? error.message : 'Failed to initialize the AR workspace.'
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
		this.sceneBundle.controls.dispose();
		this.sceneBundle.renderer.dispose();

	}

	handleArUiInteraction(): void {

		this.pointerSelection.cancelPendingSelection( 900 );

	}

	closePropertyPanel(): void {

		this.pointerSelection.suppressSelectionFor( 1000 );
		this.propertySelection.clearSelection();
		this.setStatus( 'Closed the component detail panel.' );

	}

	selectModel(modelId: string): void {

		this.modelSession.handleModelSelection( modelId );

	}

	setDisplayMode(mode: DisplayMode): void {

		if ( mode !== 'normal' && mode !== 'xray' && mode !== 'occlusion-outline' ) {
			return;
		}

		if ( this.store.getState().displayMode === mode ) {
			return;
		}

		this.store.patch( { displayMode: mode } );
		this.setStatus( `Display mode switched to ${getDisplayModeLabel( mode )}.` );

	}

	cycleDisplayMode(): void {

		const modes: DisplayMode[] = [ 'normal', 'xray', 'occlusion-outline' ];
		const currentIndex = modes.indexOf( this.store.getState().displayMode );
		const nextMode = modes[ ( currentIndex + 1 + modes.length ) % modes.length ];
		this.setDisplayMode( nextMode );

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

		this.setStatus( 'Timeline playback is not connected yet.' );

	}

	async enableCoarseRegistration(): Promise<void> {

		try {
			await this.coarseRegistration.enable();
			this.store.patch( { registrationStatusDetail: 'Status: coarse registration enabled' } );
			this.syncArSessionPhase();
		} catch ( error ) {
			console.error( 'Coarse registration enable failed:', error );
			this.setStatus( error instanceof Error ? error.message : 'Failed to enable coarse registration.' );
		}

	}

	async refreshGeoLocation(): Promise<void> {

		try {
			await this.coarseRegistration.refreshGeolocation();
			this.setStatus( this.coarseRegistration.getReadyMessage() );
			this.syncArSessionPhase();
		} catch ( error ) {
			console.error( 'Geolocation refresh failed:', error );
			this.setStatus( error instanceof Error ? error.message : 'Failed to refresh location.' );
		}

	}

	resetPlacement(): void {

		this.hasCommittedArPlacement = false;
		this.placementSession.resetPlacement();
		this.syncArSessionPhase();
		this.syncSceneHost();
		if ( this.sceneBundle.renderer.xr.isPresenting ) {
			this.setStatus( 'Model placement reset. Scan a plane again before placing the model.' );
			return;
		}

		this.ensureDesktopPreviewPlacement();
		this.placementSession.fitDesktopPreviewToCamera();
		this.setStatus( 'Model placement reset.' );

	}

	adjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void {

		this.manualRegistration.adjustTranslation( axis, direction );
		this.reapplyManualPlacement();

	}

	adjustYaw(direction: 1 | -1): void {

		this.manualRegistration.adjustYaw( direction );
		this.reapplyManualPlacement();

	}

	adjustScale(direction: 1 | -1): void {

		this.manualRegistration.adjustScale( direction );
		this.reapplyManualPlacement();

	}

	saveManualRegistration(): void {

		if ( this.demoModelConfig === null ) {
			this.setStatus( 'Model metadata is not ready yet.' );
			return;
		}

		this.manualRegistration.save( this.demoModelConfig.modelId );
		this.setStatus( 'Manual registration saved.' );

	}

	resetManualRegistration(): void {

		if ( this.demoModelConfig !== null ) {
			this.manualRegistration.clearSaved( this.demoModelConfig.modelId );
		}

		this.manualRegistration.reset();
		this.reapplyManualPlacement();
		this.setStatus( 'Manual adjustment reset.' );

	}

	clearSavedRegistration(): boolean {

		if ( this.demoModelConfig === null ) {
			this.setStatus( 'Model metadata is not ready yet.' );
			return false;
		}

		this.manualRegistration.clearSaved( this.demoModelConfig.modelId );
		this.precisionRegistration.clearSaved( this.demoModelConfig.modelId );
		this.manualRegistration.reset();
		this.reapplyManualPlacement();
		this.setStatus( 'Saved registration results were cleared.' );
		return true;

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
			this.setStatus( 'AR session has not started yet.' );
			return;
		}

		if ( this.xrRuntime.getHitTestController().hasGroundHit() === false ) {
			this.setStatus( 'Scan the ground or wall first, then place the model.' );
			return;
		}

		if ( this.modelTemplate === null || this.registrationSolution === null ) {
			this.setStatus( 'Model resources are not ready yet.' );
			return;
		}

		if ( this.coarseRegistration.canEstimate() === false ) {
			try {
				this.setStatus( 'Preparing coarse registration data...' );
				await this.warmupCoarseRegistration();
				this.setStatus( this.coarseRegistration.getReadyMessage() );
			} catch ( error ) {
				console.error( 'Coarse registration warmup failed:', error );
				this.setStatus(
					error instanceof Error
						? error.message
						: 'Coarse registration preparation failed.'
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
				this.setStatus( 'Placing model...' );
				return;
			}

			this.setStatus( 'Plane detected, but placement did not complete. Please try again.' );
			return;
		}

		this.hasCommittedArPlacement = true;
		this.store.patch( { workspaceMode: 'browse' } );
		this.patchArSessionPhase( 'placed' );
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.syncSceneHost();
		this.setStatus( 'Model placed. Switched to browse mode.' );

	}

	exitAr(): void {

		const session = this.sceneBundle.renderer.xr.getSession();
		if ( session === null ) {
			this.setStatus( 'No active AR session.' );
			return;
		}

		void session.end();

	}

	saveInspectionRecord(summary: string): void {

		this.setStatus( `Inspection record saved: ${summary}` );

	}

	exportInspectionRecords(): void {

		this.setStatus( 'Inspection record export is not connected yet.' );

	}

	takeSnapshot(): void {

		this.setStatus( 'Screenshot capture is not connected yet.' );

	}

	runMeasurementTool(label: string): void {

		this.setStatus( `${label} is reserved for the next tool integration step.` );

	}

	toggleAnnotationHelper(label: string): void {

		this.setStatus( `${label} is reserved for the next tool integration step.` );

	}

	exportRegistrationSnapshot(): void {

		if ( this.demoModelConfig === null || this.registrationSolution === null ) {
			this.setStatus( 'There is no registration snapshot to export.' );
			return;
		}

		const snapshot = createRegistrationSnapshot( {
			demoModelConfig: this.demoModelConfig,
			registrationSolution: this.registrationSolution,
			currentStage: this.store.getState().timelineStages[ this.store.getState().currentTimelineStageIndex ],
			manualReadout: this.store.getState().manualReadout,
			placedModel: this.placementSession.getPlacedModel()
		} );

		const blob = new Blob( [ JSON.stringify( snapshot, null, 2 ) ], { type: 'application/json' } );
		const url = URL.createObjectURL( blob );
		const link = document.createElement( 'a' );
		link.href = url;
		link.download = `${this.demoModelConfig.modelId}-registration.json`;
		link.click();
		URL.revokeObjectURL( url );
		this.setStatus( 'Registration snapshot exported as JSON.' );

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

	private appendLog(message: string): void {

		const currentLogs = this.store.getState().logMessages;
		if ( currentLogs[ 0 ]?.endsWith( message ) ) {
			return;
		}

		const timestamp = new Date().toLocaleTimeString( 'en-US', {
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
			cameraWorldPosition: this.cameraWorldPosition,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation
		} );

		const placedModel = this.placementSession.getPlacedModel();
		if ( hadPlacedModel === false && placedModel !== null ) {
			this.precisionRegistration.applySavedResult( placedModel );
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

		this.hasCommittedArPlacement = false;
		this.pointerSelection.suppressSelectionFor( 1200 );
		this.store.patch( {
			appMode: 'ar-session',
			arSessionPhase: 'scanning',
			workspaceMode: 'registration'
		} );
		this.placementSession.resetPlacement();
		this.store.patch( { registrationStatusDetail: 'Status: scanning for planes' } );
		this.syncArSessionPhase();
		this.syncSceneHost();
		this.emit();

	}

	private handleXRSessionEnd(): void {

		this.hasCommittedArPlacement = false;
		this.store.patch( {
			appMode: 'pre-ar',
			arSessionPhase: 'scanning',
			workspaceMode: 'browse'
		} );
		this.placementSession.resetPlacement();
		this.store.patch( { registrationStatusDetail: 'Status: waiting for plane detection' } );
		this.ensureDesktopPreviewPlacement();
		this.placementSession.fitDesktopPreviewToCamera();
		this.syncSceneHost();
		this.emit();

	}

	private ensureDesktopPreviewPlacement(): void {

		this.placementSession.ensureDesktopPreviewPlacement( {
			modelTemplate: this.modelTemplate,
			registrationSolution: this.registrationSolution,
			manualApplyToPlacement: this.manualRegistration.applyToPlacement,
			manualPositionTarget: this.manualPosition,
			manualOrientationTarget: this.manualOrientation
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
			this.hasCommittedArPlacement = true;
		}

		this.syncArSessionPhase();
		this.syncSceneHost();
		this.emit();

	}

	private syncSceneHost(): void {

		if ( this.hosts === null ) {
			return;
		}

		const state = this.store.getState();
		const targetHost = this.isDesktopLayout
			? this.hosts.desktopCanvasHost
			: state.appMode === 'pre-ar'
				? this.hosts.preArCanvasHost
				: this.hosts.arCanvasHost;

		if ( this.sceneBundle.renderer.domElement.parentElement !== targetHost ) {
			targetHost.appendChild( this.sceneBundle.renderer.domElement );
		}

		const shouldShowAxes = this.isDesktopLayout;
		if ( shouldShowAxes ) {
			this.sceneBundle.scene.add( this.desktopAxesHelper );
		} else {
			this.sceneBundle.scene.remove( this.desktopAxesHelper );
		}

		this.placementSession.updateDesktopInteractionState(
			this.isDesktopLayout || state.appMode === 'pre-ar',
			this.sceneBundle.renderer.xr.isPresenting
		);

		resizeARScene( this.sceneBundle.camera, this.sceneBundle.renderer, targetHost );

	}

	private syncArSessionPhase(): void {

		if ( this.sceneBundle.renderer.xr.isPresenting === false ) {
			this.hasCommittedArPlacement = false;
			this.patchArSessionPhase( 'scanning' );
			return;
		}

		if ( this.placementSession.getCoarsePlacementPending() ) {
			this.patchArSessionPhase( 'placing' );
			return;
		}

		if ( this.hasCommittedArPlacement || this.placementSession.getPlacedModel() !== null ) {
			this.hasCommittedArPlacement = this.placementSession.getPlacedModel() !== null;
			this.patchArSessionPhase( 'placed' );
			return;
		}

		if ( this.xrRuntime.getHitTestController().hasGroundHit() ) {
			this.patchArSessionPhase( 'ready-to-place' );
			return;
		}

		this.patchArSessionPhase( 'scanning' );

	}

	private patchArSessionPhase(nextPhase: ArSessionPhase): void {

		if ( this.store.getState().arSessionPhase === nextPhase ) {
			return;
		}

		this.store.patch( { arSessionPhase: nextPhase } );

		switch ( nextPhase ) {
			case 'scanning':
				this.store.patch( { registrationStatusDetail: 'Status: scanning for planes' } );
				break;
			case 'ready-to-place':
				this.store.patch( { registrationStatusDetail: 'Status: plane detected / ready to place' } );
				break;
			case 'placing':
				this.store.patch( { registrationStatusDetail: 'Status: placing model' } );
				break;
			case 'placed':
				this.store.patch( { registrationStatusDetail: 'Status: model placed' } );
				break;
		}

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

		const host = this.sceneBundle.renderer.domElement.parentElement;
		resizeARScene( this.sceneBundle.camera, this.sceneBundle.renderer, host );
		if ( this.isDesktopLayout && this.store.getState().appMode === 'pre-ar' ) {
			this.placementSession.fitDesktopPreviewToCamera();
		}

	};

}
