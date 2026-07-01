import { createStore } from 'zustand/vanilla';
import type {
	ArDisplayMode,
	ArPlacementMode,
	SectionCutPlaneMode,
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
	registrationView: RegistrationView;
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
		setSectionCutPlaneMode(mode: SectionCutPlaneMode): void;
		activatePanel(mode: WorkspaceMode): void;
		toggleDrawer(): void;
		setTimelineStage(index: number): void;
		timelinePrev(): void;
		timelineNext(): void;
		timelinePlay(): void;
		enableCoarseRegistration(): Promise<void>;
		refreshGeoLocation(): Promise<void>;
		refreshSavedMarkerLocalization(): void;
		startCurrentSessionMarkerCalibration(): void;
		captureCurrentSessionMarkerCorner(): void;
		resetCurrentSessionMarkerCalibration(): void;
		solveAndApplyCurrentSessionMarkerCalibration(): void;
		clearMarkerLocalizationCorrection(): void;
		clearSavedMarkerLocalization(): void;
		resetPlacement(): void;
		setManualAdjustmentPreset(preset: ManualAdjustmentPreset): void;
		setPlacementMode(mode: ArPlacementMode): void;
		adjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void;
		adjustYaw(direction: 1 | -1): void;
		adjustScale(direction: 1 | -1): void;
		saveManualRegistration(): void;
		resetManualRegistration(): void;
		clearSavedRegistration(): void;
		enterAr(): void;
		placeModelAtHitTest(): void;
		placeModel(): Promise<void>;
		exitAr(): void;
		setRegistrationView(view: RegistrationView): void;
		setInspectionFormExpanded(expanded: boolean): void;
		updateInspectionDraft(patch: Partial<InspectionDraft>): void;
		saveInspectionRecord(): void;
		exportInspectionRecords(): void;
		takeSnapshot(): void;
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

function createInitialUiState(): ControllerUiState {

	return {
		drawerOpen: true,
		registrationView: 'overview',
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

	function canUseManualAdjustmentOverlay(): boolean {

		const currentEngineState = engine.getState();
		return isDesktopLayout === false && currentEngineState.appMode === 'ar-session';

	}

	engine.subscribe( () => {
		const nextState = engine.getState();
		const currentUi = stateStore.getState().ui;
		let nextUi = currentUi;

		const enteredArSession = previousEngineState.appMode !== 'ar-session' && nextState.appMode === 'ar-session';
		const completedPlacement = previousEngineState.arSessionPhase !== 'placed' && nextState.arSessionPhase === 'placed';

		if ( enteredArSession ) {
			nextUi = {
				...nextUi,
				drawerOpen: false,
				registrationView: 'overview'
			};
		}

		if ( completedPlacement ) {
			nextUi = {
				...nextUi,
				drawerOpen: false,
				registrationView: 'overview'
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
					drawerOpen: false
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

			setSectionCutPlaneMode(mode) {

				engine.setSectionCutPlaneMode( mode );

			},

			activatePanel(mode) {

				const { engine: currentEngineState, ui } = stateStore.getState();
				if ( currentEngineState.workspaceMode === mode && ui.drawerOpen ) {
					patchUiState( { drawerOpen: false } );
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
					registrationView: nextRegistrationView
				} );

			},

			toggleDrawer() {

				const ui = stateStore.getState().ui;
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

			startCurrentSessionMarkerCalibration() {

				engine.startCurrentSessionMarkerCalibration();

			},

			captureCurrentSessionMarkerCorner() {

				engine.captureCurrentSessionMarkerCorner();

			},

			resetCurrentSessionMarkerCalibration() {

				engine.resetCurrentSessionMarkerCalibration();

			},

			solveAndApplyCurrentSessionMarkerCalibration() {

				engine.solveAndApplyCurrentSessionMarkerCalibration();

			},

			clearMarkerLocalizationCorrection() {

				engine.clearMarkerLocalizationCorrection();

			},

			clearSavedMarkerLocalization() {

				engine.clearSavedMarkerLocalization();

			},

			resetPlacement() {

				engine.resetPlacement();
				patchUiState( {
					drawerOpen: false,
					registrationView: 'overview'
				} );

			},

			setManualAdjustmentPreset(preset) {

				engine.setManualAdjustmentPreset( preset );

			},

			setPlacementMode(mode) {

				engine.setPlacementMode( mode );

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

			},

			enterAr() {

				engine.enterAr();

			},

			placeModelAtHitTest() {

				engine.placeModelAtHitTest();

			},

			placeModel() {

				return engine.placeModel();

			},

			exitAr() {

				engine.exitAr();
				patchUiState( {
					drawerOpen: false,
					registrationView: 'overview'
				} );

			},

			setRegistrationView(view) {

				const shouldUseManualOverlay = view === 'manual' && canUseManualAdjustmentOverlay();
				patchUiState( {
					drawerOpen: shouldUseManualOverlay ? false : true,
					registrationView: view
				} );

			},

			setInspectionFormExpanded(expanded) {

				patchUiState( {
					drawerOpen: true,
					inspectionFormExpanded: expanded
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

			toggleAnnotationHelper(label) {

				engine.toggleAnnotationHelper( label );

			},

			exportRegistrationSnapshot() {

				engine.exportRegistrationSnapshot();

			}
		}
	};

}
