import type { ARDomElements } from './types.js';
import type { RegistrationStoreState, WorkspaceMode } from './registration-store.js';

interface InspectionDraft {
	type: string;
	severity: string;
	note: string;
}

interface MobilePanelActions {
	onCloseProperty(): void;
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
	onSetTimelineStage(index: number): void;
	onTimelinePrev(): void;
	onTimelineNext(): void;
	onTimelinePlay(): void;
	onInspectionPhoto(): void;
	onInspectionSave(draft: InspectionDraft): void;
}

export interface MobilePanelController {
	bind(actions: MobilePanelActions): void;
	render(state: RegistrationStoreState): void;
}

export function createMobilePanel(dom: ARDomElements): MobilePanelController {

	return {
		bind(actions) {

			dom.propertyCloseButton.addEventListener( 'click', actions.onCloseProperty );
			dom.modeBrowseButton.addEventListener( 'click', () => {
				actions.onSetWorkspaceMode( 'browse' );
			} );
			dom.modeRegistrationButton.addEventListener( 'click', () => {
				actions.onSetWorkspaceMode( 'registration' );
			} );
			dom.modeTimelineButton.addEventListener( 'click', () => {
				actions.onSetWorkspaceMode( 'timeline' );
			} );
			dom.modeInspectionButton.addEventListener( 'click', () => {
				actions.onSetWorkspaceMode( 'inspection' );
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

			renderModeButtons( dom, state.workspaceMode );
			renderModePanels( dom, state.workspaceMode );
			renderHeader( dom, state );
			renderPropertyPanel( dom, state );
			renderManualReadout( dom, state );
			renderTimeline( dom, state );
			dom.registrationStatusDetailEl.textContent = state.registrationStatusDetail;

		}
	};

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

function renderModePanels(dom: ARDomElements, workspaceMode: WorkspaceMode): void {

	dom.browsePanelEl.classList.toggle( 'hidden', workspaceMode !== 'browse' );
	dom.manualPanelEl.classList.toggle( 'hidden', workspaceMode !== 'registration' );
	dom.timelinePanelEl.classList.toggle( 'hidden', workspaceMode !== 'timeline' );
	dom.inspectionPanelEl.classList.toggle( 'hidden', workspaceMode !== 'inspection' );

}

function renderHeader(dom: ARDomElements, state: RegistrationStoreState): void {

	const currentStage = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';

	switch ( state.workspaceMode ) {
		case 'browse':
			dom.mobileTopTitleEl.textContent = state.projectName;
			dom.mobileTopSubtitleEl.textContent = `当前阶段：${currentStage}`;
			dom.registrationStatusEl.textContent = '默认浏览';
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

function renderTimeline(dom: ARDomElements, state: RegistrationStoreState): void {

	dom.timelineCurrentStageEl.textContent = state.timelineStages[ state.currentTimelineStageIndex ] ?? '-';

	for ( const button of dom.timelineStageButtons ) {
		const index = Number( button.dataset.stageIndex );
		button.classList.toggle( 'active', index === state.currentTimelineStageIndex );
	}

}
