import { createStore } from 'zustand/vanilla';
import type {
	DisplayMode,
	MeasurementMode,
	WorkspaceMode
} from '../registration/registration-store.js';
import type { ManualAdjustmentPreset } from '../registration/manual-registration.js';
import type { ThreeEngineHosts, ThreeEngineSnapshot } from '../runtime/three-engine.js';
import { ThreeEngine } from '../runtime/three-engine.js';

export type RegistrationView = 'overview' | 'manual' | 'control';

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
	precisionCaptureActive: boolean;
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
		setDisplayMode(mode: DisplayMode): void;
		activatePanel(mode: WorkspaceMode): void;
		toggleDrawer(): void;
		setTimelineStage(index: number): void;
		timelinePrev(): void;
		timelineNext(): void;
		timelinePlay(): void;
		enableCoarseRegistration(): Promise<void>;
		refreshGeoLocation(): Promise<void>;
		resetPlacement(): void;
		setManualAdjustmentPreset(preset: ManualAdjustmentPreset): void;
		adjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void;
		adjustYaw(direction: 1 | -1): void;
		adjustScale(direction: 1 | -1): void;
		saveManualRegistration(): void;
		resetManualRegistration(): void;
		clearSavedRegistration(): void;
		selectPrecisionSourcePoint(sourcePoint: string): void;
		armPrecisionSourcePoint(): void;
		confirmPrecisionTargetPoint(): void;
		cancelPrecisionCapture(): void;
		addPrecisionPair(): void;
		removePrecisionPair(index: number): void;
		solvePrecisionRegistration(): void;
		savePrecisionRegistration(): void;
		clearPrecisionPairs(): void;
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
		precisionCaptureActive: false,
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

	function canUsePrecisionCaptureUi(): boolean {

		const currentEngineState = engine.getState();
		return isDesktopLayout === false && currentEngineState.appMode === 'ar-session';

	}

	function canUseMeasurementCaptureUi(): boolean {

		const currentEngineState = engine.getState();
		return isDesktopLayout === false && currentEngineState.appMode === 'ar-session';

	}

	function stopPrecisionCapture(options?: {
		drawerOpen?: boolean;
		registrationView?: RegistrationView;
	}): void {

		patchUiState( {
			precisionCaptureActive: false,
			drawerOpen: options?.drawerOpen ?? stateStore.getState().ui.drawerOpen,
			registrationView: options?.registrationView ?? stateStore.getState().ui.registrationView
		} );

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
				precisionCaptureActive: false,
				measurementCaptureActive: false,
				browseDetailsExpanded: false
			};
		}

		if ( completedPlacement ) {
			nextUi = {
				...nextUi,
				drawerOpen: false,
				registrationView: 'overview',
				precisionCaptureActive: false,
				measurementCaptureActive: false
			};
		}

		if (
			newlySelectedComponent
			&& nextUi.precisionCaptureActive === false
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
				stopPrecisionCapture( { drawerOpen: true } );
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

			activatePanel(mode) {

				const { engine: currentEngineState, ui } = stateStore.getState();
				if ( currentEngineState.workspaceMode === mode && ui.drawerOpen ) {
					patchUiState( {
						drawerOpen: false,
						precisionCaptureActive: false,
						measurementCaptureActive: false
					} );
					return;
				}

				engine.setWorkspaceMode( mode );
				patchUiState( {
					drawerOpen: true,
					registrationView: mode === 'registration' ? ui.registrationView : 'overview',
					precisionCaptureActive: false,
					measurementCaptureActive: false
				} );

			},

			toggleDrawer() {

				const ui = stateStore.getState().ui;
				if ( ui.precisionCaptureActive || ui.measurementCaptureActive ) {
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

			resetPlacement() {

				engine.resetPlacement();
				stopPrecisionCapture( { drawerOpen: false, registrationView: 'overview' } );
				stopMeasurementCapture( { drawerOpen: false } );

			},

			setManualAdjustmentPreset(preset) {

				engine.setManualAdjustmentPreset( preset );

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
				stopPrecisionCapture();

			},

			selectPrecisionSourcePoint(sourcePoint) {

				engine.selectPrecisionSourcePoint( sourcePoint );

			},

			armPrecisionSourcePoint() {

				engine.armPrecisionSourcePoint();
				if ( canUsePrecisionCaptureUi() && engine.getState().precisionRegistration.isSourceLocked ) {
					patchUiState( {
						drawerOpen: false,
						registrationView: 'control',
						precisionCaptureActive: true,
						measurementCaptureActive: false
					} );
				}

			},

			confirmPrecisionTargetPoint() {

				engine.confirmPrecisionTargetPoint();

			},

			cancelPrecisionCapture() {

				engine.cancelPrecisionCapture();
				stopPrecisionCapture( {
					drawerOpen: true,
					registrationView: 'control'
				} );

			},

			addPrecisionPair() {

				engine.addPrecisionPair();
				if ( engine.getState().precisionRegistration.isSourceLocked === false ) {
					stopPrecisionCapture( {
						drawerOpen: true,
						registrationView: 'control'
					} );
				}

			},

			removePrecisionPair(index) {

				engine.removePrecisionPair( index );
				stopPrecisionCapture();

			},

			solvePrecisionRegistration() {

				engine.solvePrecisionRegistration();

			},

			savePrecisionRegistration() {

				engine.savePrecisionRegistration();

			},

			clearPrecisionPairs() {

				engine.clearPrecisionPairs();
				stopPrecisionCapture( {
					drawerOpen: true,
					registrationView: 'control'
				} );

			},

			startMeasurementMode(mode) {

				engine.setWorkspaceMode( 'tools' );
				engine.startMeasurementMode( mode );
				const measurementState = engine.getState().measurement;
				if ( canUseMeasurementCaptureUi() && measurementState.isCapturing ) {
					patchUiState( {
						drawerOpen: false,
						precisionCaptureActive: false,
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
				stopPrecisionCapture( {
					drawerOpen: false,
					registrationView: 'overview'
				} );
				stopMeasurementCapture( { drawerOpen: false } );

			},

			setBrowseDetailsExpanded(expanded) {

				patchUiState( { browseDetailsExpanded: expanded } );

			},

			setRegistrationView(view) {

				patchUiState( {
					drawerOpen: true,
					registrationView: view,
					precisionCaptureActive: false,
					measurementCaptureActive: false
				} );

			},

			setInspectionFormExpanded(expanded) {

				patchUiState( {
					drawerOpen: true,
					inspectionFormExpanded: expanded,
					precisionCaptureActive: false,
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
