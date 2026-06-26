import * as THREE from 'three';
import type { DepthSensingMode, DisplayMode } from '../registration/registration-store.js';
import {
	createDepthAwareOverlayRuntime,
	type DepthAwareOverlayKind
} from './depth-aware-overlay.js';

interface DisplayModeControllerOptions {
	getPlacedModel(): THREE.Group | null;
	renderer: THREE.WebGLRenderer;
}

interface MaterialSnapshot {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	depthTest: boolean;
}

const DISPLAY_MODE_TAGS = {
	helper: '__displayModeHelper',
	outline: '__displayModeOutline',
	depthOverlay: '__displayModeDepthOverlay'
} as const;

export interface DisplayModeController {
	sync(mode: DisplayMode): void;
	updateDepthState(frame?: XRFrame): void;
	setDepthSensingMode(mode: DepthSensingMode): void;
	reset(): void;
	dispose(): void;
}

const XRAY_OPACITY = 0.45;
const OUTLINE_COLOR = 0x55d7ff;
const OUTLINE_OPACITY = 0.92;
const OUTLINE_RENDER_ORDER = 50;
const DEPTH_OVERLAY_RENDER_ORDER = 60;

export function createDisplayModeController(
	options: DisplayModeControllerOptions
): DisplayModeController {

	const materialSnapshots = new WeakMap<THREE.Material, MaterialSnapshot>();
	const depthAwareOverlay = createDepthAwareOverlayRuntime( {
		renderer: options.renderer
	} );
	let currentRoot: THREE.Group | null = null;
	let currentMode: DisplayMode | null = null;

	function sync(mode: DisplayMode): void {

		depthAwareOverlay.update();
		const placedModel = options.getPlacedModel();
		if ( placedModel === currentRoot && mode === currentMode ) {
			return;
		}

		if ( currentRoot !== null ) {
			restoreModel( currentRoot );
		}

		currentRoot = placedModel;
		currentMode = mode;

		if ( placedModel === null ) {
			return;
		}

		applyMode( placedModel, mode );

	}

	function updateDepthState(frame?: XRFrame): void {

		const wasActive = depthAwareOverlay.isActive();
		const isActive = depthAwareOverlay.update( frame );
		if ( wasActive === isActive ) {
			return;
		}

		if ( currentRoot === null || currentMode === null || currentMode === 'normal' ) {
			return;
		}

		restoreModel( currentRoot );
		applyMode( currentRoot, currentMode );

	}

	function setDepthSensingMode(mode: DepthSensingMode): void {

		const wasActive = depthAwareOverlay.isActive();
		depthAwareOverlay.setDepthSensingMode( mode );
		const isActive = depthAwareOverlay.update();
		if ( wasActive === isActive ) {
			return;
		}

		if ( currentRoot === null || currentMode === null || currentMode === 'normal' ) {
			return;
		}

		restoreModel( currentRoot );
		applyMode( currentRoot, currentMode );

	}

	function reset(): void {

		if ( currentRoot !== null ) {
			restoreModel( currentRoot );
		}

		currentRoot = null;
		currentMode = null;

	}

	function dispose(): void {

		reset();
		depthAwareOverlay.dispose();

	}

	function applyMode(root: THREE.Group, mode: DisplayMode): void {

		if ( mode === 'normal' ) {
			return;
		}

		root.traverse( ( child ) => {
			if ( child.userData[ DISPLAY_MODE_TAGS.helper ] === true ) {
				return;
			}

			if ( child instanceof THREE.Mesh ) {
				if ( mode === 'xray' ) {
					if ( depthAwareOverlay.isActive() ) {
						ensureDepthOverlay( child, 'xray' );
					} else {
						applyXrayMaterial( child.material );
					}
				}

				if ( mode === 'occlusion-outline' ) {
					if ( depthAwareOverlay.isActive() ) {
						ensureDepthOverlay( child, 'wireframe' );
					} else {
						ensureOutline( child );
					}
				}
			}
		} );

	}

	function restoreModel(root: THREE.Group): void {

		const outlines: THREE.LineSegments[] = [];
		const overlays: THREE.Mesh[] = [];

		root.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh ) {
				restoreMaterial( child.material );
			}

			if ( child instanceof THREE.LineSegments && child.userData[ DISPLAY_MODE_TAGS.outline ] === true ) {
				outlines.push( child );
			}

			if ( child instanceof THREE.Mesh && child.userData[ DISPLAY_MODE_TAGS.depthOverlay ] === true ) {
				overlays.push( child );
			}
		} );

		for ( const outline of outlines ) {
			if ( outline.parent !== null ) {
				delete outline.parent.userData[ DISPLAY_MODE_TAGS.outline ];
			}
			outline.removeFromParent();
			outline.geometry.dispose();
			disposeMaterial( outline.material );
		}

		for ( const overlay of overlays ) {
			if ( overlay.parent !== null ) {
				delete overlay.parent.userData[ DISPLAY_MODE_TAGS.depthOverlay ];
			}
			overlay.removeFromParent();
		}

	}

	function applyXrayMaterial(material: THREE.Material | THREE.Material[]): void {

		forEachMaterial( material, ( item ) => {
			rememberMaterial( item );
			item.transparent = true;
			item.opacity = Math.min( item.opacity, XRAY_OPACITY );
			item.depthWrite = false;
			item.depthTest = true;
			item.needsUpdate = true;
		} );

	}

	function restoreMaterial(material: THREE.Material | THREE.Material[]): void {

		forEachMaterial( material, ( item ) => {
			const snapshot = materialSnapshots.get( item );
			if ( snapshot === undefined ) {
				return;
			}

			item.transparent = snapshot.transparent;
			item.opacity = snapshot.opacity;
			item.depthWrite = snapshot.depthWrite;
			item.depthTest = snapshot.depthTest;
			item.needsUpdate = true;
		} );

	}

	function rememberMaterial(material: THREE.Material): void {

		if ( materialSnapshots.has( material ) ) {
			return;
		}

		materialSnapshots.set( material, {
			transparent: material.transparent,
			opacity: material.opacity,
			depthWrite: material.depthWrite,
			depthTest: material.depthTest
		} );

	}

	function ensureOutline(mesh: THREE.Mesh): void {

		if ( mesh.userData[ DISPLAY_MODE_TAGS.outline ] instanceof THREE.LineSegments ) {
			return;
		}

		const outline = new THREE.LineSegments(
			new THREE.EdgesGeometry( mesh.geometry ),
			new THREE.LineBasicMaterial( {
				color: OUTLINE_COLOR,
				depthTest: false,
				transparent: true,
				opacity: OUTLINE_OPACITY,
				toneMapped: false
			} )
		);

		outline.name = '__display-mode-outline';
		outline.renderOrder = OUTLINE_RENDER_ORDER;
		outline.frustumCulled = false;
		outline.raycast = () => {};
		outline.userData[ DISPLAY_MODE_TAGS.outline ] = true;
		mesh.userData[ DISPLAY_MODE_TAGS.outline ] = outline;
		mesh.add( outline );

	}

	function ensureDepthOverlay(mesh: THREE.Mesh, kind: DepthAwareOverlayKind): void {

		if ( mesh.userData[ DISPLAY_MODE_TAGS.depthOverlay ] instanceof THREE.Mesh ) {
			return;
		}

		const overlay = new THREE.Mesh(
			mesh.geometry,
			depthAwareOverlay.getMaterial( kind )
		);

		overlay.name = kind === 'xray'
			? '__display-mode-depth-xray'
			: '__display-mode-depth-wireframe';
		overlay.matrixAutoUpdate = false;
		overlay.updateMatrix();
		overlay.frustumCulled = false;
		overlay.renderOrder = DEPTH_OVERLAY_RENDER_ORDER;
		overlay.raycast = () => {};
		overlay.userData[ DISPLAY_MODE_TAGS.helper ] = true;
		overlay.userData[ DISPLAY_MODE_TAGS.depthOverlay ] = true;
		mesh.userData[ DISPLAY_MODE_TAGS.depthOverlay ] = overlay;
		mesh.add( overlay );

	}

	return {
		sync,
		updateDepthState,
		setDepthSensingMode,
		reset,
		dispose
	};

}

export function preserveRootTransform(root: THREE.Object3D, apply: () => void): void {

	const position = root.position.clone();
	const quaternion = root.quaternion.clone();
	const scale = root.scale.clone();

	apply();

	root.position.copy( position );
	root.quaternion.copy( quaternion );
	root.scale.copy( scale );

}

function forEachMaterial(
	material: THREE.Material | THREE.Material[],
	callback: (material: THREE.Material) => void
): void {

	if ( Array.isArray( material ) ) {
		for ( const item of material ) {
			callback( item );
		}
		return;
	}

	callback( material );

}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {

	if ( Array.isArray( material ) ) {
		for ( const item of material ) {
			item.dispose();
		}
		return;
	}

	material.dispose();

}
