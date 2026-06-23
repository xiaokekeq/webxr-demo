import type { ModelCatalogItem } from '../data/model-catalog.js';
import type {
	ArSessionPhase,
	ArSupportState,
	RegistrationStoreState,
	WorkspaceMode
} from '../data/registration-store.js';
import type { ARDomElements } from './types.js';

interface InspectionDraft {
	type: string;
	severity: string;
	note: string;
}

interface MobilePanelActions {
	onCloseProperty(): void;
	onSelectModel(modelId: string): void;
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
	setArOverlayActive(active: boolean): void;
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
	browse: '浏览面板',
	registration: '配准面板',
	timeline: '时间面板',
	inspection: '核查面板'
};

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
		setWorkspaceMode: MobilePanelActions[ 'onSetWorkspaceMode' ]
	): void {

		const isActive = latestState?.workspaceMode === nextMode;
		if ( isActive && isDrawerCollapsed === false ) {
			collapseDrawer();
			return;
		}

		setWorkspaceMode( nextMode );
		expandDrawer();

	}

	return {
		bind(actions) {

			dom.propertyCloseButton.addEventListener( 'click', () => {
				actions.onCloseProperty();
				browseDetailsExpanded = false;
				collapseDrawer();
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
				handleModeToggle( 'timeline', actions.onSetWorkspaceMode );
			} );
			dom.modeInspectionButton.addEventListener( 'click', () => {
				handleModeToggle( 'inspection', actions.onSetWorkspaceMode );
			} );

			dom.mobileDrawerToggleButton.addEventListener( 'click', () => {
				if ( isDrawerCollapsed ) {
					expandDrawer();
					return;
				}

				collapseDrawer();
			} );

			dom.resetPlacementButton.addEventListener( 'click', actions.onResetPlacement );
			dom.toolLayersButton.addEventListener( 'click', actions.onShowLayers );
			dom.toolMeasureButton.addEventListener( 'click', actions.onMeasure );
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

			dom.inspectionStartFormButton.addEventListener( 'click', () => {
				inspectionFormExpanded = true;
				expandDrawer();
			} );
			dom.inspectionViewListButton.addEventListener( 'click', () => {
				inspectionFormExpanded = false;
				rerender();
			} );
			dom.inspectionPhotoButton.addEventListener( 'click', actions.onInspectionPhoto );
			dom.inspectionSaveButton.addEventListener( 'click', () => {
				actions.onInspectionSave( {
					type: dom.inspectionTypeEl.value,
					severity: dom.inspectionSeverityEl.value,
					note: dom.inspectionNoteEl.value.trim()
				} );
			} );

			for ( const button of dom.timelineStageButtons ) {
				button.addEventListener( 'click', () => {
					const index = Number( button.dataset.stageIndex );
					if ( Number.isInteger( index ) ) {
						actions.onSetTimelineStage( index );
					}
				} );
			}

		},

		render(state) {

			latestState = state;
			renderInternal( state );

		},

		setArOverlayActive(active) {

			isArOverlayActive = active;
			if ( active ) {
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
		renderModelSelect( dom.modelSelectEl, state.availableModels, state.selectedModelId );
		renderPropertyPanel( dom, state, browseDetailsExpanded );
		renderManualReadout( dom, state );
		renderRegistrationPanel( dom, state, registrationView );
		renderPrecisionRegistration( dom, state );
		renderTimeline( dom, state );
		renderInspectionPanel( dom, inspectionFormExpanded );

		dom.registrationStatusDetailEl.textContent = state.registrationStatusDetail;
		dom.mobileDrawerToggleButton.setAttribute( 'aria-expanded', String( !isDrawerCollapsed ) );
		dom.mobileDrawerToggleLabelEl.textContent = isDrawerCollapsed
			? `展开${MODE_LABELS[ state.workspaceMode ]}`
			: '收起面板';

	}

	function renderArSessionChrome(
		domElements: ARDomElements,
		state: RegistrationStoreState,
		drawerCollapsed: boolean
	): void {

		const inAr = state.appMode === 'ar-session';
		const showWorkUi = inAr && state.arSessionPhase === 'placed';
		const showPlacementUi = inAr && state.arSessionPhase !== 'placed';

		if ( showWorkUi && isArOverlayActive && drawerCollapsed === false ) {
			isDrawerCollapsed = true;
			drawerCollapsed = true;
		}

		domElements.mobileRightToolsEl.classList.toggle( 'hidden', !showWorkUi );
		domElements.mobileBottomNavEl.classList.toggle( 'hidden', !showWorkUi );
		domElements.mobileDrawerToggleButton.classList.toggle( 'hidden', !showWorkUi );
		domElements.mobileDrawerAreaEl.classList.toggle( 'hidden', !showWorkUi );
		domElements.mobileDrawerAreaEl.classList.toggle( 'is-collapsed', showWorkUi && drawerCollapsed );
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
			? '放置模型'
			: '正在识别平面';

	}

}

function renderAppModeShells(
	dom: ARDomElements,
	appMode: RegistrationStoreState[ 'appMode' ]
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

	renderModelSelect( dom.mobilePreArModelSelectEl, state.availableModels, state.selectedModelId );
	renderStageSelect( dom.mobilePreArStageSelectEl, state.timelineStages, state.currentTimelineStageIndex );
	renderSimpleChipList( dom.mobilePreArLayerListEl, state.layerNames );
	renderPreArSupport( dom, state.arSupportState, state.arSupportMessage );

	dom.mobilePreArEnterArButton.disabled = state.arSupportState !== 'supported';

}

function renderHeader(dom: ARDomElements, state: RegistrationStoreState): void {

	const currentStage = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';

	if ( state.appMode === 'ar-session' && state.arSessionPhase !== 'placed' ) {
		dom.mobileTopTitleEl.textContent = state.projectName;
		dom.mobileTopSubtitleEl.textContent = state.arSessionPhase === 'ready-to-place'
			? '已识别平面，请确认位置并放置模型'
			: '正在识别平面';
		dom.registrationStatusEl.textContent = state.arSessionPhase === 'ready-to-place'
			? '待放置'
			: '识别中';
		return;
	}

	switch ( state.workspaceMode ) {
		case 'browse':
			dom.mobileTopTitleEl.textContent = state.projectName;
			dom.mobileTopSubtitleEl.textContent = `当前阶段：${currentStage}`;
			dom.registrationStatusEl.textContent = '浏览';
			break;
		case 'registration':
			dom.mobileTopTitleEl.textContent = '当前模式：配准';
			dom.mobileTopSubtitleEl.textContent = '模型已放置，可继续位置校正';
			dom.registrationStatusEl.textContent = '配准中';
			break;
		case 'timeline':
			dom.mobileTopTitleEl.textContent = `当前阶段：${currentStage}`;
			dom.mobileTopSubtitleEl.textContent = '按阶段查看现场模型状态';
			dom.registrationStatusEl.textContent = '时间模式';
			break;
		case 'inspection':
			dom.mobileTopTitleEl.textContent = '当前模式：核查';
			dom.mobileTopSubtitleEl.textContent = '记录现场问题与核查意见';
			dom.registrationStatusEl.textContent = '核查中';
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
		'请选择模型'
	);

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
		'请选择阶段'
	);

}

function renderModeButtons(dom: ARDomElements, workspaceMode: WorkspaceMode): void {

	const buttonMap: Record<WorkspaceMode, HTMLButtonElement> = {
		browse: dom.modeBrowseButton,
		registration: dom.modeRegistrationButton,
		timeline: dom.modeTimelineButton,
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

	const showPanels = state.appMode === 'ar-session' && state.arSessionPhase === 'placed' && isDrawerCollapsed === false;
	dom.browsePanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'browse' );
	dom.manualPanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'registration' );
	dom.timelinePanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'timeline' );
	dom.inspectionPanelEl.classList.toggle( 'hidden', !showPanels || state.workspaceMode !== 'inspection' );

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
			return '检测中';
		case 'supported':
			return '支持 AR';
		case 'unsupported':
			return '不支持 AR';
	}

}

function renderPropertyPanel(
	dom: ARDomElements,
	state: RegistrationStoreState,
	browseDetailsExpanded: boolean
): void {

	const hasSelection = hasSelectedPipe( state );
	togglePropertyGrid( dom, hasSelection && browseDetailsExpanded );

	dom.propertyCloseButton.textContent = browseDetailsExpanded ? '收起' : '关闭';
	dom.browsePropertyActionsEl.classList.toggle( 'hidden', !hasSelection );

	if ( hasSelection === false ) {
		dom.propertyNameEl.textContent = '浏览模式';
		dom.propertyStatusBadgeEl.textContent = '未选中';
		dom.propertyTypeEl.textContent = '-';
		dom.propertyDiameterEl.textContent = '-';
		dom.propertyMaterialEl.textContent = '-';
		dom.propertyDepthEl.textContent = '-';
		dom.propertyStatusEl.textContent = '-';
		dom.propertyRemarkEl.textContent = '点击管线查看属性';
		dom.browseShowDetailsButton.textContent = '查看详情';
		dom.browseAddInspectionButton.textContent = '新增核查';
		dom.propertyCloseButton.classList.add( 'hidden' );
		return;
	}

	dom.propertyCloseButton.classList.remove( 'hidden' );
	dom.propertyNameEl.textContent = state.propertyPanel.name;
	dom.propertyStatusBadgeEl.textContent = state.propertyPanel.statusBadge;
	dom.propertyTypeEl.textContent = state.propertyPanel.type;
	dom.propertyDiameterEl.textContent = state.propertyPanel.diameter;
	dom.propertyMaterialEl.textContent = state.propertyPanel.material;
	dom.propertyDepthEl.textContent = state.propertyPanel.depth;
	dom.propertyStatusEl.textContent = state.propertyPanel.status;
	dom.browseShowDetailsButton.textContent = browseDetailsExpanded ? '收起详情' : '详情';
	dom.browseAddInspectionButton.textContent = '新增核查';
	dom.propertyRemarkEl.textContent = browseDetailsExpanded
		? state.propertyPanel.remark
		: `${state.propertyPanel.type} ${state.propertyPanel.diameter}，埋深 ${state.propertyPanel.depth}，状态 ${state.propertyPanel.status}`;

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

	dom.registrationOverviewCardEl.classList.remove( 'hidden' );
	dom.registrationOverviewActionRowEl.classList.remove( 'hidden' );
	dom.registrationOpenManualButton.classList.toggle( 'primary', registrationView === 'manual' );
	dom.registrationOpenControlButton.classList.toggle( 'primary', registrationView === 'control' );
	dom.registrationAdjustmentPanelEl.classList.toggle( 'hidden', registrationView !== 'manual' );
	dom.registrationPrecisionPanelEl.classList.toggle( 'hidden', registrationView !== 'control' );
	dom.registrationStatusDetailEl.textContent = state.registrationStatusDetail;

}

function renderPrecisionRegistration(dom: ARDomElements, state: RegistrationStoreState): void {

	renderSelectOptions(
		dom.precisionSourceSelectEl,
		state.precisionRegistration.availableSourcePoints.map( ( point ) => ( {
			value: point,
			label: point
		} ) ),
		state.precisionRegistration.selectedSourcePoint,
		'请选择模型控制点'
	);
	dom.precisionSourceCurrentEl.textContent = state.precisionRegistration.stagedSourcePoint;
	dom.precisionTargetCurrentEl.textContent = state.precisionRegistration.stagedTargetPoint;
	dom.precisionPairCountEl.textContent = `${state.precisionRegistration.pairSummaries.length} / 建议至少 4 组`;
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

function renderInspectionPanel(dom: ARDomElements, inspectionFormExpanded: boolean): void {

	dom.inspectionOverviewCardEl.classList.remove( 'hidden' );
	dom.inspectionFormPanelEl.classList.toggle( 'hidden', !inspectionFormExpanded );

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
			? [ createTextBlock( 'div', 'desktop-list-item', '还没有采集控制点对' ) ]
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
			title: '已识别平面',
			body: '将准星对准管线对应区域，点击“放置模型”开始现场叠加。'
		};
	}

	return {
		title: '正在识别平面',
		body: '请缓慢移动手机，扫描地面或墙面，等待系统找到可放置模型的位置。'
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
