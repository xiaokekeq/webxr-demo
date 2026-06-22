import type { ARDomElements, SetStatus } from './types.js';

export function getARDomElements(): ARDomElements {

	return {
		statusButton: getElement( 'status' ) as HTMLButtonElement,
		modelNameEl: getElement( 'model-name' ),
		canvasContainer: getElement( 'canvas-container' ),
		desktopCanvasContainer: getElement( 'desktop-canvas-container' ),
		xrButtonWrap: getElement( 'xr-button-wrap' ),
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
		mobileTopTitleEl: getElement( 'mobile-top-title' ),
		mobileTopSubtitleEl: getElement( 'mobile-top-subtitle' ),
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
		desktopCurrentModelEl: getElement( 'desktop-current-model' ),
		desktopRuntimeStatusEl: getElement( 'desktop-runtime-status' ),
		desktopModelFileEl: getElement( 'desktop-model-file' ),
		desktopPipeListEl: getElement( 'desktop-pipe-list' ),
		desktopLayerListEl: getElement( 'desktop-layer-list' ),
		desktopStageListEl: getElement( 'desktop-stage-list' ),
		desktopPreviewBadgeEl: getElement( 'desktop-preview-badge' ),
		desktopParamGpsEl: getElement( 'desktop-param-gps' ),
		desktopParamEnuEl: getElement( 'desktop-param-enu' ),
		desktopParamPositionEl: getElement( 'desktop-param-position' ),
		desktopParamQuaternionEl: getElement( 'desktop-param-quaternion' ),
		desktopParamScaleEl: getElement( 'desktop-param-scale' ),
		desktopParamRmsEl: getElement( 'desktop-param-rms' ),
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
