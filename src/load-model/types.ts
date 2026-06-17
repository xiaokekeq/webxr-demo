import type * as THREE from 'three';

export type DisplayMode = 'solid' | 'transparent' | 'structure';

export interface PipeRecord {
	name: string;
	type?: string;
	diameter?: string;
	material?: string;
	depth?: string;
	status?: string;
	remark?: string;
}

export interface PropertyElements {
	panel: HTMLElement;
	name: HTMLElement;
	type: HTMLElement;
	diameter: HTMLElement;
	material: HTMLElement;
	depth: HTMLElement;
	status: HTMLElement;
	remark: HTMLElement;
}

export interface PreviousSelection {
	object: THREE.Object3D | null;
	name: string | null;
	properties: PipeRecord | null;
}
