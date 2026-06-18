import type * as THREE from 'three';

export type SetStatus = (message: string) => void;

export interface ARDomElements {
	overlayEl: HTMLElement;
	overlayToggleButton: HTMLButtonElement;
	overlayBodyEl: HTMLElement;
	modelNameEl: HTMLElement;
	statusEl: HTMLElement;
	canvasContainer: HTMLElement;
	xrButtonWrap: HTMLElement;
	enableCoarseButton: HTMLButtonElement;
	refreshGeoButton: HTMLButtonElement;
	resetPlacementButton: HTMLButtonElement;
}

export interface ARSceneBundle {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	renderer: THREE.WebGLRenderer;
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
	yawRad: number;
	distanceMeters: number;
	headingDeg: number;
	accuracyMeters: number | null;
	sourceLabel: string;
}
