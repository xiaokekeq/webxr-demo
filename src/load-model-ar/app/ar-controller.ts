import { createStore } from 'zustand/vanilla';
import type {
	DepthSensingMode,
	ArDisplayMode,
	MeasurementMode,
	WorkspaceMode
} from '../registration/registration-store.js';
import type { ManualAdjustmentPreset } from '../registration/manual-registration.js';
import type { ThreeEngineHosts, ThreeEngineSnapshot } from '../runtime/three-engine.js';
import { ThreeEngine } from '../runtime/three-engine.js';

export type RegistrationView = 'overview' | 'manual';

export interface InspectionDraft {
	result: string;
	type: string;
	severity: string;
	note: string;
}

export interface ControllerUiState {
	drawerOpen: boolean;
	browseDetailsExpanded: boolean;
	registrationView: RegistrationView;
	layerCycleDirection: 'hide' | 'restore';
	measurementCaptureActive: boolean;
	inspectionFormExpanded: boolean;
	inspectionDraft: InspectionDraft;
}

export interface LoadModelArControllerState {
	engine: ThreeEngineSnapshot;
	ui: ControllerUiState;
}

export interface LoadModelArController {
	initialize(): Promise<void>;
	dispose(): void;
	mountHosts(hosts: ThreeEngineHosts): void;
	setLayoutMode(isDesktopLayout: boolean): void;
	getState(): LoadModelArControllerState;
	subscribe(listener: () => void): () => void;
	actions: {
		handleArUiInteraction(): void;
		closePropertyPanel(): void;
		selectModel(modelId: string): void;
		setDisplayMode(mode: ArDisplayMode): void;
		setStructureRevealValue(value: number): void;
		activatePanel(mode: WorkspaceMode): void;
		toggleDrawer(): void;
		setTimelineStage(index: number): void;
		timelinePrev(): void;
		timelineNext(): void;
		timelinePlay(): void;
		enableCoarseRegistration(): Promise<void>;
		refreshGeoLocation(): Promise<void>;
		refreshSavedMarkerLocalization(): void;
		applyMarkerLocalizationCorrection(): void;
		clearMarkerLocalizationCorrection(): void;
		clearSavedMarkerLocalization(): void;
		placeDebugAnchorCube(): void;
		clearDebugAnchorCube(): void;
		resetPlacement(): void;
		hideTopModelLayer(): void;
		restoreModelLayer(): void;
		resetModelLayers(): void;
		cycleModelLayer(): void;
		setManualAdjustmentPreset(preset: ManualAdjustmentPreset): void;
		setAutoPreviewPlacementEnabled(enabled: boolean): void;
		setDepthSensingMode(mode: DepthSensingMode): void;
		adjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void;
		adjustYaw(direction: 1 | -1): void;
		adjustScale(direction: 1 | -1): void;
		saveManualRegistration(): void;
		resetManualRegistration(): void;
		clearSavedRegistration(): void;
		startMeasurementMode(mode: MeasurementMode): void;
		confirmMeasurementPoint(): void;
		cancelMeasurement(): void;
		clearMeasurement(): void;
		enterAr(): void;
		placeModel(): Promise<void>;
		exitAr(): void;
		setBrowseDetailsExpanded(expanded: boolean): void;
		setRegistrationView(view: RegistrationView): void;
		setInspectionFormExpanded(expanded: boolean): void;
		updateInspectionDraft(patch: Partial<InspectionDraft>): void;
		saveInspectionRecord(): void;
		exportInspectionRecords(): void;
		takeSnapshot(): void;
		runMeasurementTool(label: string): void;
		toggleAnnotationHelper(label: string): void;
		exportRegistrationSnapshot(): void;
	};
}

const DEFAULT_INSPECTION_DRAFT: InspectionDraft = {
	result: '正常',
	type: '位置偏差',
	severity: '一般',
	note: ''
};

function hasSelection(state: ThreeEngineSnapshot): boolean {

	return state.hasSelection;

}

function createInitialUiState(): ControllerUiState {

	return {
		drawerOpen: true,
		browseDetailsExpanded: false,
		registrationView: 'overview',
		layerCycleDirection: 'hide',
		measurementCaptureActive: false,
		inspectionFormExpanded: false,
		inspectionDraft: { ...DEFAULT_INSPECTION_DRAFT }
	};

}

export function createLoadModelArController(): LoadModelArController {

	const engine = new ThreeEngine();
	const stateStore = createStore<LoadModelArControllerState>()( () => ( {
		engine: engine.getState(),
		ui: createInitialUiState()
	} ) );
	let previousEngineState = engine.getState();
	let isDesktopLayout = window.matchMedia( '(any-pointer: fine)' ).matches;

	function patchUiState(patch: Partial<ControllerUiState>): void {

		stateStore.setState( ( state ) => ( {
			...state,
			ui: {
				...state.ui,
				...patch
			}
		} ) );

	}

	function canUseMeasurementCaptureUi(): boolean {

		const currentEngineState = engine.getState();
		return isDesktopLayout === false && currentEngineState.appMode === 'ar-session';

	}

	function canUseManualAdjustmentOverlay(): boolean {

		const currentEngineState = engine.getState();
		return isDesktopLayout === false && currentEngineState.appMode === 'ar-session';

	}

	function getLayerVisibilityCounts() {

		const layers = engine.getState().modelLayers;
		const hiddenCount = layers.filter( ( layer ) => layer.visible === false ).length;
		return {
			totalCount: layers.length,
			hiddenCount,
			visibleCount: layers.length - hiddenCount
		};

	}

	function getNextLayerCycleDirectionAfterHide(): 'hide' | 'restore' {

		const { visibleCount } = getLayerVisibilityCounts();
		return visibleCount <= 1 ? 'restore' : 'hide';

	}

	function getNextLayerCycleDirectionAfterRestore(): 'hide' | 'restore' {

		const { hiddenCount } = getLayerVisibilityCounts();
		return hiddenCount === 0 ? 'hide' : 'restore';

	}

	function stopMeasurementCapture(options?: {
		drawerOpen?: boolean;
	}): void {

		patchUiState( {
			measurementCaptureActive: false,
			drawerOpen: options?.drawerOpen ?? stateStore.getState().ui.drawerOpen
		} );

	}

	engine.subscribe( () => {
		const nextState = engine.getState();
		const currentUi = stateStore.getState().ui;
		let nextUi = currentUi;

		const enteredArSession = previousEngineState.appMode !== 'ar-session' && nextState.appMode === 'ar-session';
		const completedPlacement = previousEngineState.arSessionPhase !== 'placed' && nextState.arSessionPhase === 'placed';
		const newlySelectedComponent = hasSelection( previousEngineState ) === false && hasSelection( nextState );

		if ( enteredArSession ) {
			nextUi = {
				...nextUi,
				drawerOpen: false,
				registrationView: 'overview',
				layerCycleDirection: 'hide',
				measurementCaptureActive: false,
				browseDetailsExpanded: false
			};
		}

		if ( completedPlacement ) {
			nextUi = {
				...nextUi,
				drawerOpen: false,
				registrationView: 'overview',
				measurementCaptureActive: false
			};
		}

		if (
			newlySelectedComponent
			&& nextUi.measurementCaptureActive === false
		) {
			nextUi = {
				...nextUi,
				drawerOpen: true,
				browseDetailsExpanded: true
			};
		}

		if ( nextState.measurement.isCapturing === false && currentUi.measurementCaptureActive ) {
			nextUi = {
				...nextUi,
				measurementCaptureActive: false,
				drawerOpen: true
			};
		}

		previousEngineState = nextState;
		stateStore.setState( {
			engine: nextState,
			ui: nextUi
		} );
	} );

	return {
		initialize() {

			return engine.initialize();

		},

		dispose() {

			engine.dispose();

		},

		mountHosts(hosts) {

			engine.mount( hosts );

		},

		setLayoutMode(nextIsDesktopLayout) {

			isDesktopLayout = nextIsDesktopLayout;
			engine.setLayoutMode( nextIsDesktopLayout );
			if ( nextIsDesktopLayout ) {
				stopMeasurementCapture( { drawerOpen: true } );
			}

		},

		getState() {

			return stateStore.getState();

		},

		subscribe(listener) {

			return stateStore.subscribe( listener );

		},

		actions: {
			handleArUiInteraction() {

				engine.handleArUiInteraction();

			},

			closePropertyPanel() {

				engine.closePropertyPanel();
				patchUiState( {
					drawerOpen: false,
					browseDetailsExpanded: false
				} );

			},

			selectModel(modelId) {

				engine.selectModel( modelId );

			},

			setDisplayMode(mode) {

				engine.setDisplayMode( mode );

			},

			setStructureRevealValue(value) {

				engine.setStructureRevealValue( value );

			},

			activatePanel(mode) {

				const { engine: currentEngineState, ui } = stateStore.getState();
				if ( currentEngineState.workspaceMode === mode && ui.drawerOpen ) {
					patchUiState( {
						drawerOpen: false,
						measurementCaptureActive: false
					} );
					return;
				}

				engine.setWorkspaceMode( mode );
				const nextRegistrationView = mode === 'registration' && ui.registrationView === 'manual' && canUseManualAdjustmentOverlay()
					? 'overview'
					: mode === 'registration'
						? ui.registrationView
						: 'overview';
				patchUiState( {
					drawerOpen: true,
					registrationView: nextRegistrationView,
					measurementCaptureActive: false
				} );

			},

			toggleDrawer() {

				const ui = stateStore.getState().ui;
				if ( ui.measurementCaptureActive ) {
					return;
				}

				patchUiState( { drawerOpen: !ui.drawerOpen } );

			},

			setTimelineStage(index) {

				engine.setTimelineStage( index );

			},

			timelinePrev() {

				engine.timelinePrev();

			},

			timelineNext() {

				engine.timelineNext();

			},

			timelinePlay() {

				engine.timelinePlay();

			},

			enableCoarseRegistration() {

				return engine.enableCoarseRegistration();

			},

			refreshGeoLocation() {

				return engine.refreshGeoLocation();

			},

			refreshSavedMarkerLocalization() {

				engine.refreshSavedMarkerLocalization();

			},

			applyMarkerLocalizationCorrection() {

				engine.applySavedMarkerLocalizationCorrection();

			},

			clearMarkerLocalizationCorrection() {

				engine.clearMarkerLocalizationCorrection();

			},

			clearSavedMarkerLocalization() {

				engine.clearSavedMarkerLocalization();

			},

			placeDebugAnchorCube() {

				engine.placeDebugAnchorCube();

			},

			clearDebugAnchorCube() {

				engine.clearDebugAnchorCube();

			},

			resetPlacement() {

				engine.resetPlacement();
				patchUiState( {
					drawerOpen: false,
					registrationView: 'overview',
					layerCycleDirection: 'hide',
					measurementCaptureActive: false
				} );

			},

			hideTopModelLayer() {

				engine.hideTopModelLayer();
				patchUiState( {
					layerCycleDirection: getNextLayerCycleDirectionAfterHide()
				} );

			},

			restoreModelLayer() {

				engine.restoreModelLayer();
				patchUiState( {
					layerCycleDirection: getNextLayerCycleDirectionAfterRestore()
				} );

			},

			resetModelLayers() {

				engine.resetModelLayers();
				patchUiState( {
					layerCycleDirection: 'hide'
				} );

			},

			cycleModelLayer() {

				const { layerCycleDirection } = stateStore.getState().ui;
				if ( layerCycleDirection === 'restore' ) {
					engine.restoreModelLayer();
					patchUiState( {
						layerCycleDirection: getNextLayerCycleDirectionAfterRestore()
					} );
					return;
				}

				engine.hideTopModelLayer();
				patchUiState( {
					layerCycleDirection: getNextLayerCycleDirectionAfterHide()
				} );

			},

			setManualAdjustmentPreset(preset) {

				engine.setManualAdjustmentPreset( preset );

			},

			setAutoPreviewPlacementEnabled(enabled) {

				engine.setAutoPreviewPlacementEnabled( enabled );

			},

			setDepthSensingMode(mode) {

				engine.setDepthSensingMode( mode );

			},

			adjustTranslation(axis, direction) {

				engine.adjustTranslation( axis, direction );

			},

			adjustYaw(direction) {

				engine.adjustYaw( direction );

			},

			adjustScale(direction) {

				engine.adjustScale( direction );

			},

			saveManualRegistration() {

				engine.saveManualRegistration();

			},

			resetManualRegistration() {

				engine.resetManualRegistration();

			},

			clearSavedRegistration() {

				engine.clearSavedRegistration();
				patchUiState( {
					measurementCaptureActive: false
				} );

			},

			startMeasurementMode(mode) {

				engine.setWorkspaceMode( 'tools' );
				engine.startMeasurementMode( mode );
				const measurementState = engine.getState().measurement;
				if ( canUseMeasurementCaptureUi() && measurementState.isCapturing ) {
					patchUiState( {
						drawerOpen: false,
						measurementCaptureActive: true
					} );
					return;
				}

				patchUiState( {
					drawerOpen: true,
					measurementCaptureActive: false
				} );

			},

			confirmMeasurementPoint() {

				engine.confirmMeasurementPoint();
				if ( engine.getState().measurement.isCapturing === false ) {
					stopMeasurementCapture( { drawerOpen: true } );
				}

			},

			cancelMeasurement() {

				engine.cancelMeasurement();
				stopMeasurementCapture( { drawerOpen: true } );

			},

			clearMeasurement() {

				engine.clearMeasurement();
				stopMeasurementCapture( { drawerOpen: true } );

			},

			enterAr() {

				engine.enterAr();

			},

			placeModel() {

				return engine.placeModel();

			},

			exitAr() {

				engine.exitAr();
				patchUiState( {
					drawerOpen: false,
					registrationView: 'overview',
					layerCycleDirection: 'hide',
					measurementCaptureActive: false
				} );

			},

			setBrowseDetailsExpanded(expanded) {

				patchUiState( { browseDetailsExpanded: expanded } );

			},

			setRegistrationView(view) {

				const shouldUseManualOverlay = view === 'manual' && canUseManualAdjustmentOverlay();
				patchUiState( {
					drawerOpen: shouldUseManualOverlay ? false : true,
					registrationView: view,
					measurementCaptureActive: false
				} );

			},

			setInspectionFormExpanded(expanded) {

				patchUiState( {
					drawerOpen: true,
					inspectionFormExpanded: expanded,
					measurementCaptureActive: false
				} );

			},

			updateInspectionDraft(patch) {

				const { inspectionDraft } = stateStore.getState().ui;
				patchUiState( {
					inspectionDraft: {
						...inspectionDraft,
						...patch
					}
				} );

			},

			saveInspectionRecord() {

				const draft = stateStore.getState().ui.inspectionDraft;
				const summary = [ draft.result, draft.type, draft.severity, draft.note ].filter( Boolean ).join( ' / ' );
				engine.saveInspectionRecord( summary );

			},

			exportInspectionRecords() {

				engine.exportInspectionRecords();

			},

			takeSnapshot() {

				engine.takeSnapshot();

			},

			runMeasurementTool(label) {

				engine.runMeasurementTool( label );

			},

			toggleAnnotationHelper(label) {

				engine.toggleAnnotationHelper( label );

			},

			exportRegistrationSnapshot() {

				engine.exportRegistrationSnapshot();

			}
		}
	};

}
