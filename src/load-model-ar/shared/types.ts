import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type SetStatus = (message: string) => void;

export interface ARDomElements {
	statusButton: HTMLButtonElement;
	modelNameEl: HTMLElement;
	modelSelectEl: HTMLSelectElement;
	canvasContainer: HTMLElement;
	desktopCanvasContainer: HTMLElement;
	mobilePreArShellEl: HTMLElement;
	mobileArShellEl: HTMLElement;
	mobilePreArCanvasContainer: HTMLElement;
	mobilePreArModelSelectEl: HTMLSelectElement;
	mobilePreArStageSelectEl: HTMLSelectElement;
	mobilePreArDisplayModeSelectEl: HTMLSelectElement;
	mobilePreArProjectNameEl: HTMLElement;
	mobilePreArCurrentModelEl: HTMLElement;
	mobilePreArCurrentStageEl: HTMLElement;
	mobilePreArRuntimeStatusEl: HTMLElement;
	mobilePreArPreviewStatusEl: HTMLElement;
	mobilePreArSupportBadgeEl: HTMLElement;
	mobilePreArSupportMessageEl: HTMLElement;
	mobilePreArLayerListEl: HTMLElement;
	mobilePreArEnterArButton: HTMLButtonElement;
	xrButtonWrap: HTMLElement;
	mobileDisplayModeSelectEl: HTMLSelectElement;
	mobileRightToolsEl: HTMLElement;
	mobileBottomNavEl: HTMLElement;
	mobileArGuidanceEl: HTMLElement;
	mobileArGuidanceTitleEl: HTMLElement;
	mobileArGuidanceBodyEl: HTMLElement;
	mobileArPrimaryBarEl: HTMLElement;
	mobileArExitButton: HTMLButtonElement;
	mobileArPlaceButton: HTMLButtonElement;
	browseLayerListEl: HTMLElement;
	browsePropertyActionsEl: HTMLElement;
	browseShowDetailsButton: HTMLButtonElement;
	browseAddInspectionButton: HTMLButtonElement;
	registrationOverviewCardEl: HTMLElement;
	registrationOverviewActionRowEl: HTMLElement;
	registrationOpenManualButton: HTMLButtonElement;
	registrationRepositionButton: HTMLButtonElement;
	registrationClearSavedButton: HTMLButtonElement;
	registrationSaveButton: HTMLButtonElement;
	registrationAdjustmentPanelEl: HTMLElement;
	inspectionOverviewCardEl: HTMLElement;
	inspectionStartFormButton: HTMLButtonElement;
	inspectionViewListButton: HTMLButtonElement;
	inspectionFormPanelEl: HTMLElement;
	propertyCloseButton: HTMLButtonElement;
	propertyNameEl: HTMLElement;
	propertyStatusBadgeEl: HTMLElement;
	propertyTypeEl: HTMLElement;
	propertyDiameterEl: HTMLElement;
	propertyMaterialEl: HTMLElement;
	propertyDepthEl: HTMLElement;
	propertyStatusEl: HTMLElement;
	propertyRemarkEl: HTMLElement;
	resetPlacementButton: HTMLButtonElement;
	enableCoarseButton: HTMLButtonElement;
	refreshGeoButton: HTMLButtonElement;
	modeBrowseButton: HTMLButtonElement;
	modeRegistrationButton: HTMLButtonElement;
	modeTimelineButton: HTMLButtonElement;
	modeInspectionButton: HTMLButtonElement;
	mobileTopbarEl: HTMLElement;
	mobileTopTitleEl: HTMLElement;
	mobileTopSubtitleEl: HTMLElement;
	mobileDrawerAreaEl: HTMLElement;
	mobileDrawerToggleButton: HTMLButtonElement;
	mobileDrawerToggleLabelEl: HTMLElement;
	registrationStatusEl: HTMLElement;
	registrationStatusDetailEl: HTMLElement;
	browsePanelEl: HTMLElement;
	manualPanelEl: HTMLElement;
	timelinePanelEl: HTMLElement;
	inspectionPanelEl: HTMLElement;
	manualLeftButton: HTMLButtonElement;
	manualRightButton: HTMLButtonElement;
	manualFrontButton: HTMLButtonElement;
	manualBackButton: HTMLButtonElement;
	manualUpButton: HTMLButtonElement;
	manualDownButton: HTMLButtonElement;
	manualYawLeftButton: HTMLButtonElement;
	manualYawRightButton: HTMLButtonElement;
	manualScaleUpButton: HTMLButtonElement;
	manualScaleDownButton: HTMLButtonElement;
	manualSaveButton: HTMLButtonElement;
	manualResetButton: HTMLButtonElement;
	manualValuePositionEl: HTMLElement;
	manualValueYawEl: HTMLElement;
	manualValueScaleEl: HTMLElement;
	timelineCurrentStageEl: HTMLElement;
	timelinePrevButton: HTMLButtonElement;
	timelineNextButton: HTMLButtonElement;
	timelinePlayButton: HTMLButtonElement;
	timelineStageButtons: HTMLButtonElement[];
	inspectionCurrentNameEl: HTMLElement;
	inspectionCurrentTypeEl: HTMLElement;
	inspectionCurrentStatusEl: HTMLElement;
	inspectionResultEl: HTMLSelectElement;
	inspectionTypeEl: HTMLSelectElement;
	inspectionSeverityEl: HTMLSelectElement;
	inspectionNoteEl: HTMLTextAreaElement;
	inspectionPhotoButton: HTMLButtonElement;
	inspectionSaveButton: HTMLButtonElement;
	inspectionExportButton: HTMLButtonElement;
	desktopProjectNameEl: HTMLElement;
	desktopModelSelectEl: HTMLSelectElement;
	desktopCurrentModelEl: HTMLElement;
	desktopRuntimeStatusEl: HTMLElement;
	desktopModelFileEl: HTMLElement;
	desktopPipeListEl: HTMLElement;
	desktopLayerListEl: HTMLElement;
	desktopStageListEl: HTMLElement;
	desktopPreviewBadgeEl: HTMLElement;
	desktopDisplayModeSelectEl: HTMLSelectElement;
	desktopParamGpsEl: HTMLElement;
	desktopParamEnuEl: HTMLElement;
	desktopParamPositionEl: HTMLElement;
	desktopParamQuaternionEl: HTMLElement;
	desktopParamScaleEl: HTMLElement;
	desktopParamRmsEl: HTMLElement;
	desktopSaveRegistrationButton: HTMLButtonElement;
	desktopExportJsonButton: HTMLButtonElement;
	desktopLogListEl: HTMLElement;
}

export interface ARSceneBundle {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	renderer: THREE.WebGLRenderer;
	controls: OrbitControls;
	reticle: THREE.Group;
	previewModelAnchor: THREE.Group;
	arPlacementAnchor: THREE.Group;
	arModelAnchor: THREE.Group;
}

export interface XRAnchorHandle {
	anchorSpace: XRSpace;
	delete?(): void;
}

export interface XRHitTestController {
	setup(): void;
	update(frame: XRFrame): void;
	hasGroundHit(): boolean;
	getHitPosition(target: THREE.Vector3): THREE.Vector3 | null;
	getHitMatrix(target: THREE.Matrix4): THREE.Matrix4 | null;
	getHitTestQuality(): XRHitTestQuality | null;
	supportsAnchors(): boolean;
	createAnchorFromLatestHit(): Promise<XRAnchorHandle | null>;
	requestSession(): void;
}

export interface XRHitTestQuality {
	sampleCount: number;
	jitterMeters: number;
	ageMs: number;
}

export interface CoarsePlacementEstimate {
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	distanceMeters: number;
	headingDeg: number;
	accuracyMeters: number | null;
	sourceLabel: string;
	groundY: number;
	enuVerticalOffsetApplied: boolean;
}
