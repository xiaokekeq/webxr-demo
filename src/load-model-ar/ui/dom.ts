import type { ARDomElements, SetStatus } from './types.js';

export function getARDomElements(): ARDomElements {

	return {
		statusButton: getElement( 'status' ) as HTMLButtonElement,
		modelNameEl: getElement( 'model-name' ),
		modelSelectEl: getElement( 'model-select' ) as HTMLSelectElement,
		canvasContainer: getElement( 'canvas-container' ),
		desktopCanvasContainer: getElement( 'desktop-canvas-container' ),
		mobilePreArShellEl: getElement( 'mobile-pre-ar-shell' ),
		mobileArShellEl: getElement( 'mobile-ar-shell' ),
		mobilePreArCanvasContainer: getElement( 'mobile-pre-ar-canvas-container' ),
		mobilePreArModelSelectEl: getElement( 'mobile-pre-ar-model-select' ) as HTMLSelectElement,
		mobilePreArStageSelectEl: getElement( 'mobile-pre-ar-stage-select' ) as HTMLSelectElement,
		mobilePreArProjectNameEl: getElement( 'mobile-pre-ar-project-name' ),
		mobilePreArCurrentModelEl: getElement( 'mobile-pre-ar-current-model' ),
		mobilePreArCurrentStageEl: getElement( 'mobile-pre-ar-current-stage' ),
		mobilePreArRuntimeStatusEl: getElement( 'mobile-pre-ar-runtime-status' ),
		mobilePreArPreviewStatusEl: getElement( 'mobile-pre-ar-preview-status' ),
		mobilePreArSupportBadgeEl: getElement( 'mobile-pre-ar-support-badge' ),
		mobilePreArSupportMessageEl: getElement( 'mobile-pre-ar-support-message' ),
		mobilePreArLayerListEl: getElement( 'mobile-pre-ar-layer-list' ),
		mobilePreArEnterArButton: getElement( 'mobile-pre-ar-enter-ar' ) as HTMLButtonElement,
		xrButtonWrap: getElement( 'xr-button-wrap' ),
		mobileDisplayModeSelectEl: getElement( 'mobile-display-mode-select' ) as HTMLSelectElement,
		mobileRightToolsEl: getElement( 'mobile-right-tools' ),
		mobileBottomNavEl: getElement( 'mobile-bottom-nav' ),
		mobileArGuidanceEl: getElement( 'mobile-ar-guidance' ),
		mobileArGuidanceTitleEl: getElement( 'mobile-ar-guidance-title' ),
		mobileArGuidanceBodyEl: getElement( 'mobile-ar-guidance-body' ),
		mobileArPrimaryBarEl: getElement( 'mobile-ar-primary-bar' ),
		mobileArExitButton: getElement( 'mobile-ar-exit' ) as HTMLButtonElement,
		mobileArPlaceButton: getElement( 'mobile-ar-place' ) as HTMLButtonElement,
		browsePropertyActionsEl: getElement( 'browse-property-actions' ),
		browseShowDetailsButton: getElement( 'browse-show-details' ) as HTMLButtonElement,
		browseAddInspectionButton: getElement( 'browse-add-inspection' ) as HTMLButtonElement,
		registrationOverviewCardEl: getElement( 'registration-overview-card' ),
		registrationOverviewActionRowEl: getElement( 'registration-overview-action-row' ),
		registrationOpenManualButton: getElement( 'registration-open-manual' ) as HTMLButtonElement,
		registrationOpenControlButton: getElement( 'registration-open-control' ) as HTMLButtonElement,
		registrationSaveButton: getElement( 'registration-save' ) as HTMLButtonElement,
		registrationAdjustmentPanelEl: getElement( 'registration-adjustment-panel' ),
		registrationPrecisionPanelEl: getElement( 'registration-precision-panel' ),
		inspectionOverviewCardEl: getElement( 'inspection-overview-card' ),
		inspectionStartFormButton: getElement( 'inspection-start-form' ) as HTMLButtonElement,
		inspectionViewListButton: getElement( 'inspection-view-list' ) as HTMLButtonElement,
		inspectionFormPanelEl: getElement( 'inspection-form-panel' ),
		propertyCloseButton: getElement( 'ar-property-close' ) as HTMLButtonElement,
		propertyNameEl: getElement( 'ar-prop-name' ),
		propertyStatusBadgeEl: getElement( 'ar-prop-status-badge' ),
		propertyTypeEl: getElement( 'ar-prop-type' ),
		propertyDiameterEl: getElement( 'ar-prop-diameter' ),
		propertyMaterialEl: getElement( 'ar-prop-material' ),
		propertyDepthEl: getElement( 'ar-prop-depth' ),
		propertyStatusEl: getElement( 'ar-prop-status' ),
		propertyRemarkEl: getElement( 'ar-prop-remark' ),
		resetPlacementButton: getElement( 'reset-placement' ) as HTMLButtonElement,
		enableCoarseButton: getElement( 'enable-coarse' ) as HTMLButtonElement,
		refreshGeoButton: getElement( 'refresh-geo' ) as HTMLButtonElement,
		toolLayersButton: getElement( 'tool-layers' ) as HTMLButtonElement,
		toolMeasureButton: getElement( 'tool-measure' ) as HTMLButtonElement,
		modeBrowseButton: getElement( 'mode-browse' ) as HTMLButtonElement,
		modeRegistrationButton: getElement( 'mode-registration' ) as HTMLButtonElement,
		modeTimelineButton: getElement( 'mode-timeline' ) as HTMLButtonElement,
		modeInspectionButton: getElement( 'mode-inspection' ) as HTMLButtonElement,
		mobileTopbarEl: getElement( 'mobile-topbar' ),
		mobileTopTitleEl: getElement( 'mobile-top-title' ),
		mobileTopSubtitleEl: getElement( 'mobile-top-subtitle' ),
		mobileDrawerAreaEl: getElement( 'mobile-drawer-area' ),
		mobileDrawerToggleButton: getElement( 'mobile-drawer-toggle' ) as HTMLButtonElement,
		mobileDrawerToggleLabelEl: getElement( 'mobile-drawer-toggle-label' ),
		registrationStatusEl: getElement( 'registration-status' ),
		registrationStatusDetailEl: getElement( 'registration-status-detail' ),
		browsePanelEl: getElement( 'browse-panel' ),
		manualPanelEl: getElement( 'manual-registration-panel' ),
		timelinePanelEl: getElement( 'timeline-panel' ),
		inspectionPanelEl: getElement( 'inspection-panel' ),
		manualLeftButton: getElement( 'manual-left' ) as HTMLButtonElement,
		manualRightButton: getElement( 'manual-right' ) as HTMLButtonElement,
		manualFrontButton: getElement( 'manual-front' ) as HTMLButtonElement,
		manualBackButton: getElement( 'manual-back' ) as HTMLButtonElement,
		manualUpButton: getElement( 'manual-up' ) as HTMLButtonElement,
		manualDownButton: getElement( 'manual-down' ) as HTMLButtonElement,
		manualYawLeftButton: getElement( 'manual-yaw-left' ) as HTMLButtonElement,
		manualYawRightButton: getElement( 'manual-yaw-right' ) as HTMLButtonElement,
		manualScaleUpButton: getElement( 'manual-scale-up' ) as HTMLButtonElement,
		manualScaleDownButton: getElement( 'manual-scale-down' ) as HTMLButtonElement,
		manualSaveButton: getElement( 'manual-save' ) as HTMLButtonElement,
		manualResetButton: getElement( 'manual-reset' ) as HTMLButtonElement,
		manualValuePositionEl: getElement( 'manual-value-position' ),
		manualValueYawEl: getElement( 'manual-value-yaw' ),
		manualValueScaleEl: getElement( 'manual-value-scale' ),
		precisionSourceSelectEl: getElement( 'precision-source-select' ) as HTMLSelectElement,
		precisionSourceArmButton: getElement( 'precision-source-arm' ) as HTMLButtonElement,
		precisionTargetConfirmButton: getElement( 'precision-target-confirm' ) as HTMLButtonElement,
		precisionPairAddButton: getElement( 'precision-pair-add' ) as HTMLButtonElement,
		precisionSolveButton: getElement( 'precision-solve' ) as HTMLButtonElement,
		precisionSaveButton: getElement( 'precision-save' ) as HTMLButtonElement,
		precisionClearButton: getElement( 'precision-clear' ) as HTMLButtonElement,
		precisionSourceCurrentEl: getElement( 'precision-source-current' ),
		precisionTargetCurrentEl: getElement( 'precision-target-current' ),
		precisionPairCountEl: getElement( 'precision-pair-count' ),
		precisionRmsEl: getElement( 'precision-rms' ),
		precisionWorkflowStatusEl: getElement( 'precision-workflow-status' ),
		precisionPairListEl: getElement( 'precision-pair-list' ),
		timelineCurrentStageEl: getElement( 'timeline-current-stage' ),
		timelinePrevButton: getElement( 'timeline-prev' ) as HTMLButtonElement,
		timelineNextButton: getElement( 'timeline-next' ) as HTMLButtonElement,
		timelinePlayButton: getElement( 'timeline-play' ) as HTMLButtonElement,
		timelineStageButtons: Array.from( document.querySelectorAll<HTMLButtonElement>( '.timeline-stage-button' ) ),
		inspectionTypeEl: getElement( 'inspection-type' ) as HTMLSelectElement,
		inspectionSeverityEl: getElement( 'inspection-severity' ) as HTMLSelectElement,
		inspectionNoteEl: getElement( 'inspection-note' ) as HTMLTextAreaElement,
		inspectionPhotoButton: getElement( 'inspection-photo' ) as HTMLButtonElement,
		inspectionSaveButton: getElement( 'inspection-save' ) as HTMLButtonElement,
		desktopProjectNameEl: getElement( 'desktop-project-name' ),
		desktopModelSelectEl: getElement( 'desktop-model-select' ) as HTMLSelectElement,
		desktopCurrentModelEl: getElement( 'desktop-current-model' ),
		desktopRuntimeStatusEl: getElement( 'desktop-runtime-status' ),
		desktopModelFileEl: getElement( 'desktop-model-file' ),
		desktopPipeListEl: getElement( 'desktop-pipe-list' ),
		desktopLayerListEl: getElement( 'desktop-layer-list' ),
		desktopStageListEl: getElement( 'desktop-stage-list' ),
		desktopPreviewBadgeEl: getElement( 'desktop-preview-badge' ),
		desktopDisplayModeSelectEl: getElement( 'desktop-display-mode-select' ) as HTMLSelectElement,
		desktopParamGpsEl: getElement( 'desktop-param-gps' ),
		desktopParamEnuEl: getElement( 'desktop-param-enu' ),
		desktopParamPositionEl: getElement( 'desktop-param-position' ),
		desktopParamQuaternionEl: getElement( 'desktop-param-quaternion' ),
		desktopParamScaleEl: getElement( 'desktop-param-scale' ),
		desktopParamRmsEl: getElement( 'desktop-param-rms' ),
		desktopPrecisionSourceSelectEl: getElement( 'desktop-precision-source-select' ) as HTMLSelectElement,
		desktopPrecisionSourceArmButton: getElement( 'desktop-precision-source-arm' ) as HTMLButtonElement,
		desktopPrecisionTargetConfirmButton: getElement( 'desktop-precision-target-confirm' ) as HTMLButtonElement,
		desktopPrecisionPairAddButton: getElement( 'desktop-precision-pair-add' ) as HTMLButtonElement,
		desktopPrecisionSolveButton: getElement( 'desktop-precision-solve' ) as HTMLButtonElement,
		desktopPrecisionSaveButton: getElement( 'desktop-precision-save' ) as HTMLButtonElement,
		desktopPrecisionClearButton: getElement( 'desktop-precision-clear' ) as HTMLButtonElement,
		desktopPrecisionSourceCurrentEl: getElement( 'desktop-precision-source-current' ),
		desktopPrecisionTargetCurrentEl: getElement( 'desktop-precision-target-current' ),
		desktopPrecisionPairCountEl: getElement( 'desktop-precision-pair-count' ),
		desktopPrecisionRmsEl: getElement( 'desktop-precision-rms' ),
		desktopPrecisionWorkflowStatusEl: getElement( 'desktop-precision-workflow-status' ),
		desktopPrecisionPairListEl: getElement( 'desktop-precision-pair-list' ),
		desktopSaveRegistrationButton: getElement( 'desktop-save-registration' ) as HTMLButtonElement,
		desktopExportJsonButton: getElement( 'desktop-export-json' ) as HTMLButtonElement,
		desktopLogListEl: getElement( 'desktop-log-list' )
	};

}

export function createStatusUpdater(statusButton: HTMLButtonElement): SetStatus {

	let currentStatus = '';

	return (message: string) => {
		if ( currentStatus === message ) {
			return;
		}

		currentStatus = message;
		statusButton.textContent = message;
	};

}

function getElement(id: string): HTMLElement {

	const element = document.getElementById( id );
	if ( element === null ) {
		throw new Error( `Missing DOM element: #${id}` );
	}

	return element;

}
