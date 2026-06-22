import type { ModelCatalogItem } from '../data/model-catalog.js';
import type {
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
}

export interface MobilePanelController {
	bind(actions: MobilePanelActions): void;
	render(state: RegistrationStoreState): void;
	setArOverlayActive(active: boolean): void;
}

export function createMobilePanel(dom: ARDomElements): MobilePanelController {

	let latestState: RegistrationStoreState | null = null;
	let isDrawerCollapsed = false;
	let isArOverlayActive = false;

	function applyMobileChrome(state: RegistrationStoreState): void {

		const isArSession = state.appMode === 'ar-session';

		dom.mobileTopbarEl.classList.toggle( 'is-hidden', isArSession && isArOverlayActive );
		dom.mobileDrawerAreaEl.classList.toggle( 'is-collapsed', isArSession && isDrawerCollapsed );
		dom.mobileDrawerToggleButton.setAttribute( 'aria-expanded', String( !isDrawerCollapsed ) );
		dom.mobileDrawerToggleLabelEl.textContent = isDrawerCollapsed
			? `展开${getModeLabel( state.workspaceMode )}`
			: '收起面板';

	}

	function collapseDrawer(): void {

		isDrawerCollapsed = true;
		if ( latestState !== null ) {
			applyMobileChrome( latestState );
			renderModePanels( dom, latestState.workspaceMode, isDrawerCollapsed );
		}

	}

	function expandDrawer(): void {

		isDrawerCollapsed = false;
		if ( latestState !== null ) {
			applyMobileChrome( latestState );
			renderModePanels( dom, latestState.workspaceMode, isDrawerCollapsed );
		}

	}

	return {
		bind(actions) {

			dom.propertyCloseButton.addEventListener( 'click', () => {
				actions.onCloseProperty();
				collapseDrawer();
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

			renderAppModeShells( dom, state.appMode );
			renderPreArLayout( dom, state );
			renderModeButtons( dom, state.workspaceMode );
			renderModePanels( dom, state.workspaceMode, isDrawerCollapsed );
			renderHeader( dom, state );
			renderModelSelect( dom.modelSelectEl, state.availableModels, state.selectedModelId );
			renderPropertyPanel( dom, state );
			renderManualReadout( dom, state );
			renderPrecisionRegistration( dom, state );
			renderTimeline( dom, state );
			dom.registrationStatusDetailEl.textContent = state.registrationStatusDetail;
			applyMobileChrome( state );

		},

		setArOverlayActive(active) {

			isArOverlayActive = active;
			if ( active ) {
				isDrawerCollapsed = true;
			}

			if ( latestState !== null ) {
				applyMobileChrome( latestState );
				renderModePanels( dom, latestState.workspaceMode, isDrawerCollapsed );
			}

		}
	};

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
	workspaceMode: WorkspaceMode,
	isDrawerCollapsed: boolean
): void {

	dom.browsePanelEl.classList.toggle( 'hidden', isDrawerCollapsed || workspaceMode !== 'browse' );
	dom.manualPanelEl.classList.toggle( 'hidden', isDrawerCollapsed || workspaceMode !== 'registration' );
	dom.timelinePanelEl.classList.toggle( 'hidden', isDrawerCollapsed || workspaceMode !== 'timeline' );
	dom.inspectionPanelEl.classList.toggle( 'hidden', isDrawerCollapsed || workspaceMode !== 'inspection' );

}

function renderHeader(dom: ARDomElements, state: RegistrationStoreState): void {

	const currentStage = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';

	switch ( state.workspaceMode ) {
		case 'browse':
			dom.mobileTopTitleEl.textContent = state.projectName;
			dom.mobileTopSubtitleEl.textContent = `当前阶段：${currentStage}`;
			dom.registrationStatusEl.textContent = '浏览模式';
			break;
		case 'registration':
			dom.mobileTopTitleEl.textContent = '当前模式：配准';
			dom.mobileTopSubtitleEl.textContent = 'AR 画面与模型位置联调';
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

function getModeLabel(workspaceMode: WorkspaceMode): string {

	switch ( workspaceMode ) {
		case 'browse':
			return '浏览面板';
		case 'registration':
			return '配准面板';
		case 'timeline':
			return '时间面板';
		case 'inspection':
			return '核查面板';
	}

}

function renderPropertyPanel(dom: ARDomElements, state: RegistrationStoreState): void {

	dom.propertyNameEl.textContent = state.propertyPanel.name;
	dom.propertyStatusBadgeEl.textContent = state.propertyPanel.statusBadge;
	dom.propertyTypeEl.textContent = state.propertyPanel.type;
	dom.propertyDiameterEl.textContent = state.propertyPanel.diameter;
	dom.propertyMaterialEl.textContent = state.propertyPanel.material;
	dom.propertyDepthEl.textContent = state.propertyPanel.depth;
	dom.propertyStatusEl.textContent = state.propertyPanel.status;
	dom.propertyRemarkEl.textContent = state.propertyPanel.remark;

}

function renderManualReadout(dom: ARDomElements, state: RegistrationStoreState): void {

	dom.manualValuePositionEl.textContent = state.manualReadout.positionText;
	dom.manualValueYawEl.textContent = state.manualReadout.yawText;
	dom.manualValueScaleEl.textContent = state.manualReadout.scaleText;

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
