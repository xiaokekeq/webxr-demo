import * as THREE from 'three';
import type { ArDisplayMode } from '../registration/registration-store.js';

interface DisplayModeControllerOptions {
	getPlacedModel(): THREE.Group | null;
}

interface MaterialSnapshot {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	depthTest: boolean;
	side: THREE.Side;
}

const DISPLAY_MODE_TAGS = {
	helper: '__displayModeHelper',
	outline: '__displayModeOutline'
} as const;

export interface DisplayModeController {
	sync(mode: ArDisplayMode): void;
	updateDepthState(frame?: XRFrame): void;
	captureMaterialBaseline(): void;
	reset(): void;
	dispose(): void;
}

const OUTLINE_COLOR = 0x55d7ff;
const OUTLINE_OPACITY = 0.92;
const OUTLINE_RENDER_ORDER = 50;

export function createDisplayModeController(
	options: DisplayModeControllerOptions
): DisplayModeController {

	const materialSnapshots = new WeakMap<THREE.Material, MaterialSnapshot>();
	let currentRoot: THREE.Group | null = null;
	let currentMode: ArDisplayMode | null = null;

	function sync(mode: ArDisplayMode): void {

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

		void frame;

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

	}

	function captureMaterialBaseline(): void {

		if ( currentRoot === null ) {
			return;
		}

		currentRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh ) {
				forEachMaterial( child.material, ( material ) => {
					materialSnapshots.set( material, {
						transparent: material.transparent,
						opacity: material.opacity,
						depthWrite: material.depthWrite,
						depthTest: material.depthTest,
						side: material.side
					} );
				} );
			}
		} );

	}

	function applyMode(root: THREE.Group, mode: ArDisplayMode): void {

		if ( mode === 'solid-overlay' || mode === 'transparent-xray' || mode === 'layer-peeling' ) {
			return;
		}

		root.traverse( ( child ) => {
			if ( child.userData[ DISPLAY_MODE_TAGS.helper ] === true ) {
				return;
			}

			if ( child instanceof THREE.Mesh ) {
				if ( mode === 'section-cut' ) {
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

			if ( child instanceof THREE.LineSegments && child.userData[ DISPLAY_MODE_TAGS.outline ] === true ) {
				outlines.push( child );
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
			item.side = snapshot.side;
			item.needsUpdate = true;
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

	return {
		sync,
		updateDepthState,
		captureMaterialBaseline,
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
