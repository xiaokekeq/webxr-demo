import type { ModelCatalogItem } from '../../data/model-catalog.js';
import type {
	ArSessionPhase,
	ArSupportState,
	DisplayMode,
	RegistrationStoreState,
	WorkspaceMode
} from '../../registration/registration-store.js';
import type { ARDomElements } from './types.js';

interface InspectionDraft {
	result: string;
	type: string;
	severity: string;
	note: string;
}

interface MobilePanelActions {
	onArUiInteraction(): void;
	onCloseProperty(): void;
	onSelectModel(modelId: string): void;
	onSetDisplayMode(mode: DisplayMode): void;
	onSetWorkspaceMode(mode: WorkspaceMode): void;
	onResetPlacement(): void;
	onShowLayers(): void;
	onMeasure(): void;
	onEnableCoarse(): void;
	onRefreshGeo(): void;
	onAdjustTranslation(axis: 'x' | 'y' | 'z', direction: 1 | -1): void;
	onAdjustYaw(direction: 1 | -1): void;
	onAdjustScale(direction: 1 | -1): void;
	onSaveManualRegistration(): void;
	onResetManualRegistration(): void;
	onClearSavedRegistration(): void;
	onSelectPrecisionSourcePoint(sourcePoint: string): void;
	onArmPrecisionSourcePoint(): void;
	onConfirmPrecisionTargetPoint(): void;
	onAddPrecisionPair(): void;
	onSolvePrecisionRegistration(): void;
	onSavePrecisionRegistration(): void;
	onClearPrecisionPairs(): void;
	onSetTimelineStage(index: number): void;
	onTimelinePrev(): void;
	onTimelineNext(): void;
	onTimelinePlay(): void;
	onInspectionPhoto(): void;
	onInspectionSave(draft: InspectionDraft): void;
	onEnterAr(): void;
	onPlaceModel(): void;
	onExitAr(): void;
}

type RegistrationView = 'overview' | 'manual' | 'control';

export interface MobilePanelController {
	bind(actions: MobilePanelActions): void;
	render(state: RegistrationStoreState): void;
	revealBrowsePanel(): void;
	setArOverlayActive(active: boolean): void;
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
	browse: '娴忚',
	registration: '閰嶅噯',
	tools: '宸ュ叿',
	inspection: '鏍告煡'
};

const DISPLAY_MODES: Array<{ value: DisplayMode; label: string }> = [
	{ value: 'normal', label: '鏅€氬彔鍔? },
	{ value: 'xray', label: '閫忚鏍告煡' },
	{ value: 'occlusion-outline', label: '閬尅杞粨' }
];

const AR_HINT_VISIBLE_MS = 2400;
const AR_HINT_REPEAT_MS = 7200;

export function createMobilePanel(dom: ARDomElements): MobilePanelController {

	let latestState: RegistrationStoreState | null = null;
	let isDrawerCollapsed = false;
	let isArOverlayActive = false;
	let browseDetailsExpanded = false;
	let registrationView: RegistrationView = 'overview';
	let inspectionFormExpanded = false;
	let activeHintPhase: ArSessionPhase | null = null;
	let isPlacementHintVisible = false;
	let hintHideTimer: number | null = null;
	let hintRepeatTimer: number | null = null;

	function rerender(): void {

		if ( latestState !== null ) {
			renderInternal( latestState );
		}

	}

	function collapseDrawer(): void {

		isDrawerCollapsed = true;
		rerender();

	}

	function expandDrawer(): void {

		isDrawerCollapsed = false;
		rerender();

	}

	function clearPlacementHintTimers(): void {

		if ( hintHideTimer !== null ) {
			window.clearTimeout( hintHideTimer );
			hintHideTimer = null;
		}

		if ( hintRepeatTimer !== null ) {
			window.clearTimeout( hintRepeatTimer );
			hintRepeatTimer = null;
		}

	}

	function schedulePlacementHint(state: RegistrationStoreState): void {

		const shouldShowPlacementHint = (
			state.appMode === 'ar-session'
			&& state.arSessionPhase !== 'placed'
			&& state.arSessionPhase !== 'placing'
		);

		if ( shouldShowPlacementHint === false ) {
			activeHintPhase = null;
			isPlacementHintVisible = false;
			clearPlacementHintTimers();
			return;
		}

		if ( activeHintPhase !== state.arSessionPhase ) {
			activeHintPhase = state.arSessionPhase;
			isPlacementHintVisible = true;
			clearPlacementHintTimers();

			hintHideTimer = window.setTimeout( () => {
				isPlacementHintVisible = false;
				rerender();
			}, AR_HINT_VISIBLE_MS );

			hintRepeatTimer = window.setTimeout( () => {
				if ( latestState !== null ) {
					activeHintPhase = null;
					schedulePlacementHint( latestState );
					rerender();
				}
			}, AR_HINT_REPEAT_MS );
		}

	}

	function handleModeToggle(
		nextMode: WorkspaceMode,
		setWorkspaceMode: MobilePanelActions['onSetWorkspaceMode']
	): void {

		const isActive = latestState?.workspaceMode === nextMode;
		if ( isActive && isDrawerCollapsed === false ) {
			collapseDrawer();
			return;
		}

		setWorkspaceMode( nextMode );
		expandDrawer();

	}

	function cycleDisplayMode(actions: MobilePanelActions): void {

		if ( latestState === null ) {
			return;
		}

		const currentIndex = DISPLAY_MODES.findIndex( ( mode ) => mode.value === latestState?.displayMode );
		const nextMode = DISPLAY_MODES[ ( currentIndex + 1 + DISPLAY_MODES.length ) % DISPLAY_MODES.length ];
		actions.onSetDisplayMode( nextMode.value );

	}

	function readInspectionDraft(): InspectionDraft {

		return {
			result: dom.inspectionResultEl.value,
			type: dom.inspectionTypeEl.value,
			severity: dom.inspectionSeverityEl.value,
			note: dom.inspectionNoteEl.value.trim()
		};

	}

	return {
		bind(actions) {

			bindArUiEventShield( dom, actions );

			let propertyCloseHandledAt = -Infinity;
			const closePropertyPanel = (): void => {
				propertyCloseHandledAt = performance.now();
				actions.onCloseProperty();
				browseDetailsExpanded = false;
				collapseDrawer();
			};

			dom.propertyCloseButton.addEventListener( 'pointerdown', ( event ) => {
				event.preventDefault();
				event.stopPropagation();
				closePropertyPanel();
			} );

			dom.propertyCloseButton.addEventListener( 'click', ( event ) => {
				event.preventDefault();
				event.stopPropagation();
				if ( performance.now() - propertyCloseHandledAt > 300 ) {
					closePropertyPanel();
				}
			} );

			dom.browseShowDetailsButton.addEventListener( 'click', () => {
				browseDetailsExpanded = !browseDetailsExpanded;
				rerender();
			} );

			dom.browseAddInspectionButton.addEventListener( 'click', () => {
				inspectionFormExpanded = true;
				actions.onSetWorkspaceMode( 'inspection' );
				expandDrawer();
			} );

			dom.modelSelectEl.addEventListener( 'change', () => {
				actions.onSelectModel( dom.modelSelectEl.value );
			} );
			dom.mobilePreArModelSelectEl.addEventListener( 'change', () => {
				actions.onSelectModel( dom.mobilePreArModelSelectEl.value );
			} );
			dom.mobilePreArStageSelectEl.addEventListener( 'change', () => {
				const nextIndex = Number( dom.mobilePreArStageSelectEl.value );
				if ( Number.isInteger( nextIndex ) ) {
					actions.onSetTimelineStage( nextIndex );
				}
			} );
			dom.mobileDisplayModeSelectEl.addEventListener( 'change', () => {
				actions.onSetDisplayMode( dom.mobileDisplayModeSelectEl.value as DisplayMode );
			} );
			dom.mobilePreArDisplayModeSelectEl.addEventListener( 'change', () => {
				actions.onSetDisplayMode( dom.mobilePreArDisplayModeSelectEl.value as DisplayMode );
			} );
			dom.mobilePreArEnterArButton.addEventListener( 'click', actions.onEnterAr );
			dom.mobileArPlaceButton.addEventListener( 'click', actions.onPlaceModel );
			dom.mobileArExitButton.addEventListener( 'click', actions.onExitAr );

			dom.modeBrowseButton.addEventListener( 'click', () => {
				handleModeToggle( 'browse', actions.onSetWorkspaceMode );
			} );
			dom.modeRegistrationButton.addEventListener( 'click', () => {
				handleModeToggle( 'registration', actions.onSetWorkspaceMode );
			} );
			dom.modeTimelineButton.addEventListener( 'click', () => {
				handleModeToggle( 'tools', actions.onSetWorkspaceMode );
			} );
			dom.modeInspectionButton.addEventListener( 'click', () => {
				handleModeToggle( 'inspection', actions.onSetWorkspaceMode );
			} );

			let drawerToggleHandledAt = -Infinity;
			const toggleDrawer = (): void => {
				drawerToggleHandledAt = performance.now();
				if ( isDrawerCollapsed ) {
					expandDrawer();
					return;
				}

				collapseDrawer();
			};

			dom.mobileDrawerToggleButton.addEventListener( 'pointerdown', ( event ) => {
				actions.onArUiInteraction();
				event.preventDefault();
				event.stopPropagation();
				toggleDrawer();
			} );

			dom.mobileDrawerToggleButton.addEventListener( 'click', ( event ) => {
				actions.onArUiInteraction();
				event.preventDefault();
				event.stopPropagation();
				if ( performance.now() - drawerToggleHandledAt > 300 ) {
					toggleDrawer();
				}
			} );

			dom.resetPlacementButton.addEventListener( 'click', () => {
				cycleDisplayMode( actions );
			} );
			dom.toolLayersButton.addEventListener( 'click', actions.onInspectionPhoto );
			dom.toolMeasureButton.addEventListener( 'click', toggleDrawer );

			dom.registrationRepositionButton.addEventListener( 'click', actions.onResetPlacement );
			dom.enableCoarseButton.addEventListener( 'click', actions.onEnableCoarse );
			dom.refreshGeoButton.addEventListener( 'click', actions.onRefreshGeo );
			dom.registrationOpenManualButton.addEventListener( 'click', () => {
				registrationView = 'manual';
				expandDrawer();
			} );
			dom.registrationOpenControlButton.addEventListener( 'click', () => {
				registrationView = 'control';
				expandDrawer();
			} );
			dom.registrationSaveButton.addEventListener( 'click', actions.onSaveManualRegistration );
			dom.registrationClearSavedButton.addEventListener( 'click', actions.onClearSavedRegistration );

			dom.manualLeftButton.addEventListener( 'click', () => {
				actions.onAdjustTranslation( 'x', -1 );
			} );
			dom.manualRightButton.addEventListener( 'click', () => {
				actions.onAdjustTranslation( 'x', 1 );
			} );
			dom.manualFrontButton.addEventListener( 'click', () => {
				actions.onAdjustTranslation( 'z', -1 );
			} );
			dom.manualBackButton.addEventListener( 'click', () => {
				actions.onAdjustTranslation( 'z', 1 );
			} );
			dom.manualUpButton.addEventListener( 'click', () => {
				actions.onAdjustTranslation( 'y', 1 );
			} );
			dom.manualDownButton.addEventListener( 'click', () => {
				actions.onAdjustTranslation( 'y', -1 );
			} );
			dom.manualYawLeftButton.addEventListener( 'click', () => {
				actions.onAdjustYaw( -1 );
			} );
			dom.manualYawRightButton.addEventListener( 'click', () => {
				actions.onAdjustYaw( 1 );
			} );
			dom.manualScaleUpButton.addEventListener( 'click', () => {
				actions.onAdjustScale( 1 );
			} );
			dom.manualScaleDownButton.addEventListener( 'click', () => {
				actions.onAdjustScale( -1 );
			} );
			dom.manualSaveButton.addEventListener( 'click', actions.onSaveManualRegistration );
			dom.manualResetButton.addEventListener( 'click', actions.onResetManualRegistration );

			dom.precisionSourceSelectEl.addEventListener( 'change', () => {
				actions.onSelectPrecisionSourcePoint( dom.precisionSourceSelectEl.value );
			} );
			dom.precisionSourceArmButton.addEventListener( 'click', actions.onArmPrecisionSourcePoint );
			dom.precisionTargetConfirmButton.addEventListener( 'click', actions.onConfirmPrecisionTargetPoint );
			dom.precisionPairAddButton.addEventListener( 'click', actions.onAddPrecisionPair );
			dom.precisionSolveButton.addEventListener( 'click', actions.onSolvePrecisionRegistration );
			dom.precisionSaveButton.addEventListener( 'click', actions.onSavePrecisionRegistration );
			dom.precisionClearButton.addEventListener( 'click', actions.onClearPrecisionPairs );

			dom.timelinePrevButton.addEventListener( 'click', actions.onTimelinePrev );
			dom.timelineNextButton.addEventListener( 'click', actions.onTimelineNext );
			dom.timelinePlayButton.addEventListener( 'click', actions.onTimelinePlay );

			for ( const button of dom.timelineStageButtons ) {
				button.addEventListener( 'click', () => {
					const index = Number( button.dataset.stageIndex );
					if ( Number.isInteger( index ) ) {
						actions.onSetTimelineStage( index );
					}
				} );
			}

			dom.toolsMeasureButton.addEventListener( 'click', actions.onMeasure );
			dom.toolsHeightMeasureButton.addEventListener( 'click', actions.onMeasure );
			dom.toolsDeltaMeasureButton.addEventListener( 'click', actions.onMeasure );
			dom.toolsClearButton.addEventListener( 'click', actions.onMeasure );
			dom.toolsCaptureButton.addEventListener( 'click', actions.onInspectionPhoto );
			dom.toolsInfoCaptureButton.addEventListener( 'click', actions.onInspectionPhoto );
			dom.toolsAnnotateButton.addEventListener( 'click', actions.onShowLayers );
			dom.toolsControlPointsButton.addEventListener( 'click', actions.onShowLayers );

			dom.inspectionStartFormButton.addEventListener( 'click', () => {
				inspectionFormExpanded = true;
				expandDrawer();
				rerender();
			} );
			dom.inspectionViewListButton.addEventListener( 'click', () => {
				inspectionFormExpanded = false;
				rerender();
			} );
			dom.inspectionPhotoButton.addEventListener( 'click', actions.onInspectionPhoto );
			dom.inspectionSaveButton.addEventListener( 'click', () => {
				actions.onInspectionSave( readInspectionDraft() );
			} );
			dom.inspectionExportButton.addEventListener( 'click', () => {
				actions.onInspectionSave( readInspectionDraft() );
			} );

		},

		render(state) {

			latestState = state;
			renderInternal( state );

		},

		revealBrowsePanel() {

			browseDetailsExpanded = true;
			isDrawerCollapsed = false;
			rerender();

		},

		setArOverlayActive(active) {

			const wasActive = isArOverlayActive;
			isArOverlayActive = active;
			if ( active && wasActive === false ) {
				isDrawerCollapsed = true;
			}

			rerender();

		}
	};

	function renderInternal(state: RegistrationStoreState): void {

		schedulePlacementHint( state );
		renderAppModeShells( dom, state.appMode );
		renderPreArLayout( dom, state );
		renderHeader( dom, state );
		renderArSessionChrome( dom, state, isDrawerCollapsed );
		renderModeButtons( dom, state.workspaceMode );
		renderModePanels( dom, state, isDrawerCollapsed );
		renderDisplayModeSelect( dom.mobileDisplayModeSelectEl, state.displayMode );
		renderDisplayModeSelect( dom.mobilePreArDisplayModeSelectEl, state.displayMode );
		renderModelSelect( dom.modelSelectEl, state.availableModels, state.selectedModelId );
		renderModelSelect( dom.mobilePreArModelSelectEl, state.availableModels, state.selectedModelId );
		renderPropertyPanel( dom, state, browseDetailsExpanded );
		renderBrowsePanel( dom, state );
		renderManualReadout( dom, state );
		renderRegistrationPanel( dom, state, registrationView );
		renderPrecisionRegistration( dom, state );
		renderTimeline( dom, state );
		renderInspectionPanel( dom, state, inspectionFormExpanded );

		dom.registrationStatusDetailEl.textContent = state.registrationStatusDetail;
		dom.mobileDrawerToggleButton.setAttribute( 'aria-expanded', String( !isDrawerCollapsed ) );
		dom.mobileDrawerToggleLabelEl.textContent = isDrawerCollapsed
			? `灞曞紑${MODE_LABELS[ state.workspaceMode ]}`
			: '鏀惰捣闈㈡澘';

	}

	function renderArSessionChrome(
		domElements: ARDomElements,
		state: RegistrationStoreState,
		drawerCollapsed: boolean
	): void {

		const inAr = state.appMode === 'ar-session';
		const showPlacementUi = inAr && (
			state.arSessionPhase === 'scanning'
			|| state.arSessionPhase === 'ready-to-place'
		);
		const showQuickTools = inAr && drawerCollapsed;

		domElements.mobileRightToolsEl.classList.toggle( 'hidden', !showQuickTools );
		domElements.mobileBottomNavEl.classList.toggle( 'hidden', !inAr );
		domElements.mobileDrawerToggleButton.classList.add( 'hidden' );
		domElements.mobileDrawerAreaEl.classList.toggle( 'hidden', !inAr );
		domElements.mobileDrawerAreaEl.classList.toggle( 'is-collapsed', inAr && drawerCollapsed );
		domElements.mobileArGuidanceEl.classList.toggle(
			'hidden',
			!showPlacementUi || isPlacementHintVisible === false
		);
		domElements.mobileArPrimaryBarEl.classList.toggle( 'hidden', !showPlacementUi );

		if ( showPlacementUi ) {
			const guidance = getGuidanceContent( state.arSessionPhase );
			domElements.mobileArGuidanceTitleEl.textContent = guidance.title;
			domElements.mobileArGuidanceBodyEl.textContent = guidance.body;
		}

		domElements.mobileArPlaceButton.disabled = state.arSessionPhase !== 'ready-to-place';
		domElements.mobileArPlaceButton.textContent = state.arSessionPhase === 'ready-to-place'
			? '寮€濮嬫斁缃?
			: '绛夊緟骞抽潰';

	}

}

function bindArUiEventShield(dom: ARDomElements, actions: MobilePanelActions): void {

	const roots = [
		dom.mobileTopbarEl,
		dom.mobileArPrimaryBarEl,
		dom.mobileRightToolsEl,
		dom.mobileDrawerAreaEl,
		dom.mobileDrawerToggleButton,
		dom.mobileBottomNavEl
	];
	const eventNames = [ 'pointerdown', 'pointerup', 'click', 'touchstart', 'touchend' ];

	for ( const root of roots ) {
		for ( const eventName of eventNames ) {
			root.addEventListener( eventName, ( event ) => {
				actions.onArUiInteraction();
				event.stopPropagation();
			} );
		}
	}

}

function renderAppModeShells(
	dom: ARDomElements,
	appMode: RegistrationStoreState['appMode']
): void {

	dom.mobilePreArShellEl.classList.toggle( 'hidden', appMode !== 'pre-ar' );
	dom.mobileArShellEl.classList.toggle( 'hidden', appMode !== 'ar-session' );

}

function renderPreArLayout(dom: ARDomElements, state: RegistrationStoreState): void {

	const currentModelName = state.availableModels.find( ( model ) => model.id === state.selectedModelId )?.name ?? '-';
	const currentStage = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';

	dom.mobilePreArProjectNameEl.textContent = state.projectName;
	dom.mobilePreArCurrentModelEl.textContent = currentModelName;
	dom.mobilePreArCurrentStageEl.textContent = currentStage;
	dom.mobilePreArRuntimeStatusEl.textContent = state.runtimeStatus;
	dom.mobilePreArPreviewStatusEl.textContent = currentModelName === '-'
		? '绛夊緟妯″瀷'
		: `棰勮锛?{currentModelName}`;

	renderStageSelect( dom.mobilePreArStageSelectEl, state.timelineStages, state.currentTimelineStageIndex );
	renderSimpleChipList( dom.mobilePreArLayerListEl, state.layerNames );
	renderPreArSupport( dom, state.arSupportState, state.arSupportMessage );

	dom.mobilePreArEnterArButton.disabled = state.arSupportState !== 'supported';

}

function renderHeader(dom: ARDomElements, state: RegistrationStoreState): void {

	const currentStage = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';
	const rmsText = state.precisionRegistration.rmsText === '--'
		? state.registrationMetrics.rmsText
		: state.precisionRegistration.rmsText;

	if ( state.appMode === 'ar-session' && state.arSessionPhase !== 'placed' ) {
		dom.mobileTopTitleEl.textContent = state.projectName;
		dom.mobileTopSubtitleEl.textContent = `閰嶅噯鐘舵€侊細${state.registrationStatusDetail} / 妯″紡锛氶厤鍑哷;
		dom.registrationStatusEl.textContent = state.arSessionPhase === 'ready-to-place'
			? '寰呮斁缃?
			: state.arSessionPhase === 'placing'
				? '鏀剧疆涓?
				: '鎵弿涓?;
		return;
	}

	switch ( state.workspaceMode ) {
		case 'browse':
			dom.mobileTopTitleEl.textContent = state.projectName;
			dom.mobileTopSubtitleEl.textContent = `闃舵 ${currentStage} / RMS ${rmsText} / 妯″紡 ${getDisplayModeLabel( state.displayMode )}`;
			dom.registrationStatusEl.textContent = '娴忚';
			break;
		case 'registration':
			dom.mobileTopTitleEl.textContent = '閰嶅噯';
			dom.mobileTopSubtitleEl.textContent = `鐘舵€?${state.registrationStatusDetail} / RMS ${rmsText}`;
			dom.registrationStatusEl.textContent = '閰嶅噯';
			break;
		case 'tools':
			dom.mobileTopTitleEl.textContent = '宸ュ叿';
			dom.mobileTopSubtitleEl.textContent = `鎴浘銆佹祴閲忋€佹爣娉ㄤ笌杈呭姪鎺у埗`;
			dom.registrationStatusEl.textContent = '宸ュ叿';
			break;
		case 'inspection':
			dom.mobileTopTitleEl.textContent = '鏍告煡';
			dom.mobileTopSubtitleEl.textContent = `褰撳墠妯″紡锛氭牳鏌ヨ褰曚笌瀵煎嚭`;
			dom.registrationStatusEl.textContent = '鏍告煡';
			break;
	}

}

function renderModelSelect(
	select: HTMLSelectElement,
	models: ModelCatalogItem[],
	selectedModelId: string
): void {

	renderSelectOptions(
		select,
		models.map( ( model ) => ( { value: model.id, label: model.name } ) ),
		selectedModelId,
		'璇烽€夋嫨妯″瀷'
	);

}

function renderDisplayModeSelect(select: HTMLSelectElement, selectedMode: DisplayMode): void {

	const shouldRebuild = select.options.length !== DISPLAY_MODES.length
		|| DISPLAY_MODES.some( ( option, index ) => select.options[ index ]?.value !== option.value );

	if ( shouldRebuild ) {
		select.replaceChildren(
			...DISPLAY_MODES.map( ( option ) => {
				const element = document.createElement( 'option' );
				element.value = option.value;
				element.textContent = option.label;
				return element;
			} )
		);
	}

	select.value = DISPLAY_MODES.some( ( option ) => option.value === selectedMode )
		? selectedMode
		: 'normal';
	select.disabled = false;

}

function renderStageSelect(
	select: HTMLSelectElement,
	stages: readonly string[],
	selectedIndex: number
): void {

	renderSelectOptions(
		select,
		stages.map( ( stage, index ) => ( {
			value: String( index ),
			label: `${index + 1}. ${stage}`
		} ) ),
		String( selectedIndex ),
		'璇烽€夋嫨闃舵'
	);

}

function renderModeButtons(dom: ARDomElements, workspaceMode: WorkspaceMode): void {

	const buttonMap: Record<WorkspaceMode, HTMLButtonElement> = {
		browse: dom.modeBrowseButton,
		registration: dom.modeRegistrationButton,
		tools: dom.modeTimelineButton,
		inspection: dom.modeInspectionButton
	};

	for ( const [ mode, button ] of Object.entries( buttonMap ) as Array<[ WorkspaceMode, HTMLButtonElement ]> ) {
		button.classList.toggle( 'active', mode === workspaceMode );
	}

}

function renderModePanels(
	dom: ARDomElements,
	state: RegistrationStoreState,
	isDrawerCollapsed: boolean
): void {

	const showPanels = state.appMode === 'ar-session' && isDrawerCollapsed === false;
	const canBrowse = state.arSessionPhase === 'placed';
	dom.browsePanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'browse' || !canBrowse );
	dom.manualPanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'registration' );
	dom.timelinePanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'tools' || !canBrowse );
	dom.inspectionPanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'inspection' || !canBrowse );

}

function renderPreArSupport(
	dom: ARDomElements,
	supportState: ArSupportState,
	supportMessage: string
): void {

	dom.mobilePreArSupportBadgeEl.classList.toggle( 'supported', supportState === 'supported' );
	dom.mobilePreArSupportBadgeEl.classList.toggle( 'unsupported', supportState === 'unsupported' );
	dom.mobilePreArSupportBadgeEl.textContent = getSupportBadgeLabel( supportState );
	dom.mobilePreArSupportMessageEl.textContent = supportMessage;

}

function getSupportBadgeLabel(supportState: ArSupportState): string {

	switch ( supportState ) {
		case 'checking':
			return '妫€娴嬩腑';
		case 'supported':
			return '鏀寔 AR';
		case 'unsupported':
			return '涓嶆敮鎸?AR';
	}

}

function renderBrowsePanel(dom: ARDomElements, state: RegistrationStoreState): void {

	renderSimpleChipList( dom.browseLayerListEl, state.layerNames );

}

function renderPropertyPanel(
	dom: ARDomElements,
	state: RegistrationStoreState,
	browseDetailsExpanded: boolean
): void {

	const hasSelection = hasSelectedPipe( state );
	togglePropertyGrid( dom, hasSelection && browseDetailsExpanded );

	dom.propertyCloseButton.textContent = browseDetailsExpanded ? '鏀惰捣' : '鍏抽棴';
	dom.browsePropertyActionsEl.classList.toggle( 'hidden', !hasSelection );

	if ( hasSelection === false ) {
		dom.propertyStatusBadgeEl.textContent = getDisplayModeLabel( state.displayMode );
		dom.propertyTypeEl.textContent = '-';
		dom.propertyDiameterEl.textContent = '-';
		dom.propertyMaterialEl.textContent = '-';
		dom.propertyDepthEl.textContent = '-';
		dom.propertyStatusEl.textContent = '-';
		dom.propertyRemarkEl.textContent = '鍦ㄦ祻瑙堥潰鏉块噷璋冩暣鏄剧ず妯″紡銆佸浘灞傚拰闃舵銆?;
		dom.browseShowDetailsButton.textContent = '鏌ョ湅璇︽儏';
		dom.browseAddInspectionButton.textContent = '杩涘叆鏍告煡';
		dom.propertyCloseButton.classList.add( 'hidden' );
		return;
	}

	dom.propertyCloseButton.classList.remove( 'hidden' );
	dom.propertyStatusBadgeEl.textContent = state.propertyPanel.statusBadge;
	dom.propertyTypeEl.textContent = state.propertyPanel.type;
	dom.propertyDiameterEl.textContent = state.propertyPanel.diameter;
	dom.propertyMaterialEl.textContent = state.propertyPanel.material;
	dom.propertyDepthEl.textContent = state.propertyPanel.depth;
	dom.propertyStatusEl.textContent = state.propertyPanel.status;
	dom.browseShowDetailsButton.textContent = browseDetailsExpanded ? '鏀惰捣璇︽儏' : '鏋勪欢璇︽儏';
	dom.browseAddInspectionButton.textContent = '杩涘叆鏍告煡';
	dom.propertyRemarkEl.textContent = browseDetailsExpanded
		? state.propertyPanel.remark
		: `${state.propertyPanel.type} ${state.propertyPanel.diameter} / 娣卞害 ${state.propertyPanel.depth} / 鐘舵€?${state.propertyPanel.status}`;

}

function renderManualReadout(dom: ARDomElements, state: RegistrationStoreState): void {

	dom.manualValuePositionEl.textContent = state.manualReadout.positionText;
	dom.manualValueYawEl.textContent = state.manualReadout.yawText;
	dom.manualValueScaleEl.textContent = state.manualReadout.scaleText;

}

function renderRegistrationPanel(
	dom: ARDomElements,
	state: RegistrationStoreState,
	registrationView: RegistrationView
): void {

	const placed = state.arSessionPhase === 'placed';

	dom.registrationOverviewCardEl.classList.remove( 'hidden' );
	dom.registrationOverviewActionRowEl.classList.remove( 'hidden' );
	dom.registrationOpenManualButton.classList.toggle( 'primary', registrationView === 'manual' );
	dom.registrationOpenControlButton.classList.toggle( 'primary', registrationView === 'control' );
	dom.registrationAdjustmentPanelEl.classList.toggle( 'hidden', registrationView !== 'manual' );
	dom.registrationPrecisionPanelEl.classList.toggle( 'hidden', registrationView !== 'control' );
	dom.registrationStatusDetailEl.textContent = state.registrationStatusDetail;

	dom.registrationOpenManualButton.disabled = !placed;
	dom.registrationOpenControlButton.disabled = !placed;
	dom.registrationSaveButton.disabled = !placed;
	dom.registrationClearSavedButton.disabled = !placed;

}

function renderPrecisionRegistration(dom: ARDomElements, state: RegistrationStoreState): void {

	renderSelectOptions(
		dom.precisionSourceSelectEl,
		state.precisionRegistration.availableSourcePoints.map( ( point ) => ( {
			value: point,
			label: point
		} ) ),
		state.precisionRegistration.selectedSourcePoint,
		'璇烽€夋嫨妯″瀷鎺у埗鐐?
	);
	dom.precisionSourceCurrentEl.textContent = state.precisionRegistration.stagedSourcePoint;
	dom.precisionTargetCurrentEl.textContent = state.precisionRegistration.stagedTargetPoint;
	dom.precisionPairCountEl.textContent = `${state.precisionRegistration.pairSummaries.length} / 寤鸿鑷冲皯 4 缁刞;
	dom.precisionRmsEl.textContent = state.precisionRegistration.rmsText;
	dom.precisionWorkflowStatusEl.textContent = state.precisionRegistration.workflowStatusText;
	renderPairList( dom.precisionPairListEl, state.precisionRegistration.pairSummaries );

}

function renderTimeline(dom: ARDomElements, state: RegistrationStoreState): void {

	dom.timelineCurrentStageEl.textContent = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';

	for ( const button of dom.timelineStageButtons ) {
		const index = Number( button.dataset.stageIndex );
		button.classList.toggle( 'active', index === state.currentTimelineStageIndex );
	}

}

function renderInspectionPanel(
	dom: ARDomElements,
	state: RegistrationStoreState,
	inspectionFormExpanded: boolean
): void {

	dom.inspectionOverviewCardEl.classList.remove( 'hidden' );
	dom.inspectionFormPanelEl.classList.toggle( 'hidden', !inspectionFormExpanded );
	dom.inspectionCurrentNameEl.textContent = state.propertyPanel.name;
	dom.inspectionCurrentTypeEl.textContent = state.propertyPanel.type;
	dom.inspectionCurrentStatusEl.textContent = state.propertyPanel.status;

}

function renderSelectOptions(
	select: HTMLSelectElement,
	options: Array<{ value: string; label: string }>,
	selectedValue: string,
	placeholderLabel: string
): void {

	const nextOptions = [ { value: '', label: placeholderLabel }, ...options ];
	const shouldRebuild = select.options.length !== nextOptions.length
		|| nextOptions.some( ( option, index ) => select.options[ index ]?.value !== option.value );

	if ( shouldRebuild ) {
		select.replaceChildren(
			...nextOptions.map( ( option ) => {
				const element = document.createElement( 'option' );
				element.value = option.value;
				element.textContent = option.label;
				return element;
			} )
		);
	}

	select.value = nextOptions.some( ( option ) => option.value === selectedValue ) ? selectedValue : '';
	select.disabled = options.length === 0;

}

function renderPairList(host: HTMLElement, pairSummaries: string[]): void {

	host.replaceChildren(
		...( pairSummaries.length === 0
			? [ createTextBlock( 'div', 'desktop-list-item', '杩樻病鏈夐噰闆嗘帶鍒剁偣瀵? ) ]
			: pairSummaries.map( ( item ) => createTextBlock( 'div', 'desktop-list-item', item ) ) )
	);

}

function renderSimpleChipList(host: HTMLElement, items: readonly string[]): void {

	host.replaceChildren(
		...( items.length === 0
			? [ createTextBlock( 'div', 'pre-ar-layer-chip', '-' ) ]
			: items.map( ( item ) => createTextBlock( 'div', 'pre-ar-layer-chip', item ) ) )
	);

}

function createTextBlock<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	className: string,
	text: string
): HTMLElementTagNameMap[K] {

	const element = document.createElement( tagName );
	element.className = className;
	element.textContent = text;

	return element;

}

function getGuidanceContent(phase: ArSessionPhase): { title: string; body: string } {

	if ( phase === 'ready-to-place' ) {
		return {
			title: '宸茶瘑鍒钩闈?,
			body: '纭鍦伴潰鎴栫洰鏍囦綅缃ǔ瀹氬悗锛岀偣鍑诲紑濮嬫斁缃€?
		};
	}

	if ( phase === 'placing' ) {
		return {
			title: '姝ｅ湪鏀剧疆妯″瀷',
			body: '绯荤粺姝ｅ湪缁撳悎骞抽潰鍛戒腑涓庣矖閰嶅噯缁撴灉鐢熸垚鍒濆浣嶇疆銆?
		};
	}

	return {
		title: '姝ｅ湪璇嗗埆骞抽潰',
		body: '缂撴參绉诲姩鎵嬫満锛屾寔缁壂鎻忓湴闈㈡垨澧欓潰锛岀瓑寰呯郴缁熸壘鍒板彲鏀剧疆浣嶇疆銆?
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

function togglePropertyGrid(dom: ARDomElements, expanded: boolean): void {

	const propertyGrid = dom.propertyTypeEl.parentElement?.parentElement;
	if ( propertyGrid !== null && propertyGrid !== undefined ) {
		propertyGrid.classList.toggle( 'hidden', !expanded );
	}

}

function getDisplayModeLabel(mode: DisplayMode): string {

	return DISPLAY_MODES.find( ( item ) => item.value === mode )?.label ?? '鏅€氬彔鍔?;

}

