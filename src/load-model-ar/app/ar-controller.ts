import { createStore } from 'zustand/vanilla';
import type { DisplayMode, WorkspaceMode } from '../registration/registration-store.js';
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
		cycleDisplayMode(): void;
		activatePanel(mode: WorkspaceMode): void;
		toggleDrawer(): void;
		setTimelineStage(index: number): void;
		timelinePrev(): void;
		timelineNext(): void;
		timelinePlay(): void;
		enableCoarseRegistration(): Promise<void>;
		refreshGeoLocation(): Promise<void>;
		resetPlacement(): void;
		adjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void;
		adjustYaw(direction: 1 | -1): void;
		adjustScale(direction: 1 | -1): void;
		saveManualRegistration(): void;
		resetManualRegistration(): void;
		clearSavedRegistration(): void;
		selectPrecisionSourcePoint(sourcePoint: string): void;
		armPrecisionSourcePoint(): void;
		confirmPrecisionTargetPoint(): void;
		addPrecisionPair(): void;
		solvePrecisionRegistration(): void;
		savePrecisionRegistration(): void;
		clearPrecisionPairs(): void;
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

	function patchUiState(patch: Partial<ControllerUiState>): void {

		stateStore.setState( ( state ) => ( {
			...state,
			ui: {
				...state.ui,
				...patch
			}
		} ) );

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
				drawerOpen: true,
				registrationView: 'overview',
				browseDetailsExpanded: false
			};
		}

		if ( completedPlacement ) {
			nextUi = {
				...nextUi,
				drawerOpen: false,
				registrationView: 'overview'
			};
		}

		if ( newlySelectedComponent ) {
			nextUi = {
				...nextUi,
				drawerOpen: true,
				browseDetailsExpanded: true
			};
			engine.setWorkspaceMode( 'browse' );
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

		setLayoutMode(isDesktopLayout) {

			engine.setLayoutMode( isDesktopLayout );

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

			cycleDisplayMode() {

				engine.cycleDisplayMode();

			},

			activatePanel(mode) {

				const { engine: currentEngineState, ui } = stateStore.getState();
				if ( currentEngineState.workspaceMode === mode && ui.drawerOpen ) {
					patchUiState( { drawerOpen: false } );
					return;
				}

				engine.setWorkspaceMode( mode );
				patchUiState( {
					drawerOpen: true,
					registrationView: mode === 'registration' ? ui.registrationView : 'overview'
				} );

			},

			toggleDrawer() {

				patchUiState( { drawerOpen: !stateStore.getState().ui.drawerOpen } );

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

				if ( window.confirm( '确认清除当前模型的已保存配准结果吗？' ) ) {
					engine.clearSavedRegistration();
				}

			},

			selectPrecisionSourcePoint(sourcePoint) {

				engine.selectPrecisionSourcePoint( sourcePoint );

			},

			armPrecisionSourcePoint() {

				engine.armPrecisionSourcePoint();

			},

			confirmPrecisionTargetPoint() {

				engine.confirmPrecisionTargetPoint();

			},

			addPrecisionPair() {

				engine.addPrecisionPair();

			},

			solvePrecisionRegistration() {

				engine.solvePrecisionRegistration();

			},

			savePrecisionRegistration() {

				engine.savePrecisionRegistration();

			},

			clearPrecisionPairs() {

				engine.clearPrecisionPairs();

			},

			enterAr() {

				engine.enterAr();

			},

			placeModel() {

				return engine.placeModel();

			},

			exitAr() {

				engine.exitAr();

			},

			setBrowseDetailsExpanded(expanded) {

				patchUiState( { browseDetailsExpanded: expanded } );

			},

			setRegistrationView(view) {

				patchUiState( {
					drawerOpen: true,
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
