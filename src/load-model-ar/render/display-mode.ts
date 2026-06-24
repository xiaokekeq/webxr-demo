import * as THREE from 'three';
import type { DisplayMode } from '../data/registration-store.js';

interface DisplayModeControllerOptions {
	getPlacedModel(): THREE.Group | null;
}

interface MaterialSnapshot {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	depthTest: boolean;
}

export interface DisplayModeController {
	sync(mode: DisplayMode): void;
	reset(): void;
}

const XRAY_OPACITY = 0.45;
const OUTLINE_COLOR = 0x55d7ff;
const OUTLINE_OPACITY = 0.92;
const OUTLINE_RENDER_ORDER = 50;

export function createDisplayModeController(
	options: DisplayModeControllerOptions
): DisplayModeController {

	const materialSnapshots = new WeakMap<THREE.Material, MaterialSnapshot>();
	let currentRoot: THREE.Group | null = null;
	let currentMode: DisplayMode | null = null;

	function sync(mode: DisplayMode): void {

		const placedModel = options.getPlacedModel();
		if ( placedModel === currentRoot && mode === currentMode ) {
			if ( placedModel !== null && mode === 'xray' ) {
				applyMode( placedModel, mode );
			}
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

	function reset(): void {

		if ( currentRoot !== null ) {
			restoreModel( currentRoot );
		}

		currentRoot = null;
		currentMode = null;

	}

	function applyMode(root: THREE.Group, mode: DisplayMode): void {

		if ( mode === 'normal' ) {
			return;
		}

		root.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh ) {
				if ( mode === 'xray' ) {
					applyXrayMaterial( child.material );
				}

				if ( mode === 'occlusion-outline' ) {
					ensureOutline( child );
				}
			}
		} );

	}

	function restoreModel(root: THREE.Group): void {

		const outlines: THREE.LineSegments[] = [];

		root.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh ) {
				restoreMaterial( child.material );
			}

			if ( child instanceof THREE.LineSegments && child.userData.__displayModeOutline === true ) {
				outlines.push( child );
			}
		} );

		for ( const outline of outlines ) {
			if ( outline.parent !== null ) {
				delete outline.parent.userData.__displayModeOutline;
			}
			outline.removeFromParent();
			outline.geometry.dispose();
			disposeMaterial( outline.material );
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

		if ( mesh.userData.__displayModeOutline instanceof THREE.LineSegments ) {
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
		outline.userData.__displayModeOutline = true;
		mesh.userData.__displayModeOutline = outline;
		mesh.add( outline );

	}

	return {
		sync,
		reset
	};

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
