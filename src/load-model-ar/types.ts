import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type SetStatus = (message: string) => void;

export interface ARDomElements {
	statusButton: HTMLButtonElement;
	modelNameEl: HTMLElement;
	canvasContainer: HTMLElement;
	desktopCanvasContainer: HTMLElement;
	xrButtonWrap: HTMLElement;
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
	toolLayersButton: HTMLButtonElement;
	toolMeasureButton: HTMLButtonElement;
	modeBrowseButton: HTMLButtonElement;
	modeRegistrationButton: HTMLButtonElement;
	modeTimelineButton: HTMLButtonElement;
	modeInspectionButton: HTMLButtonElement;
	mobileTopTitleEl: HTMLElement;
	mobileTopSubtitleEl: HTMLElement;
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
	inspectionTypeEl: HTMLSelectElement;
	inspectionSeverityEl: HTMLSelectElement;
	inspectionNoteEl: HTMLTextAreaElement;
	inspectionPhotoButton: HTMLButtonElement;
	inspectionSaveButton: HTMLButtonElement;
	desktopProjectNameEl: HTMLElement;
	desktopCurrentModelEl: HTMLElement;
	desktopRuntimeStatusEl: HTMLElement;
	desktopModelFileEl: HTMLElement;
	desktopPipeListEl: HTMLElement;
	desktopLayerListEl: HTMLElement;
	desktopStageListEl: HTMLElement;
	desktopPreviewBadgeEl: HTMLElement;
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
	modelAnchor: THREE.Group;
}

export interface XRHitTestController {
	setup(): void;
	update(frame: XRFrame): void;
	hasGroundHit(): boolean;
	getHitPosition(target: THREE.Vector3): THREE.Vector3 | null;
}

export interface CoarsePlacementEstimate {
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	distanceMeters: number;
	headingDeg: number;
	accuracyMeters: number | null;
	sourceLabel: string;
}
