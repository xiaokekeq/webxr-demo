import * as THREE from 'three';
import type { SectionCutPlaneMode } from '../../registration/registration-store.js';
import {
	forEachMaterial,
	rememberMaterialSnapshot,
	rememberMeshSnapshot,
	restoreMaterialSnapshot,
	restoreMeshSnapshot
} from './material-visualization-state.js';

export interface ArSectionCutApplyResult {
	value: number;
	planeMode: SectionCutPlaneMode;
	axis: 'x' | 'y' | 'z';
	affectedMeshCount: number;
	affectedMaterialCount: number;
	cutPosition: number;
	axisMin: number;
	axisMax: number;
	meaning: string;
}

export interface ArSectionCutRestoreResult {
	mode: 'section-cut';
	restoredMaterialCount: number;
	restoredMeshCount: number;
	clearedClippingPlanes: boolean;
}

export interface ArSectionCutController {
	setPlaneMode(mode: SectionCutPlaneMode): void;
	apply(modelRoot: THREE.Object3D | null, value: number): ArSectionCutApplyResult;
	restore(): ArSectionCutRestoreResult;
	dispose(): void;
}

const tempBounds = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempPoint = new THREE.Vector3();
const tempNormal = new THREE.Vector3();

export function createArSectionCutController(renderer: THREE.WebGLRenderer): ArSectionCutController {

	const materialSnapshots = new WeakMap<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean; depthTest: boolean; side: THREE.Side; clippingPlanes: THREE.Plane[] | null; clipIntersection: boolean; clipShadows: boolean }>();
	const meshSnapshots = new WeakMap<THREE.Mesh, { visible: boolean }>();
	let currentRoot: THREE.Object3D | null = null;
	let currentPlaneMode: SectionCutPlaneMode = 'horizontal-section';

	function setPlaneMode(mode: SectionCutPlaneMode): void {

		currentPlaneMode = mode;

	}

	function apply(modelRoot: THREE.Object3D | null, value: number): ArSectionCutApplyResult {

		const nextValue = THREE.MathUtils.clamp( Math.round( value ), 0, 100 );
		if ( currentRoot !== null && currentRoot !== modelRoot ) {
			restoreRoot( currentRoot );
		}

		currentRoot = modelRoot;
		if ( modelRoot === null ) {
			renderer.localClippingEnabled = false;
			return {
				value: nextValue,
				planeMode: currentPlaneMode,
				axis: 'y',
				affectedMeshCount: 0,
				affectedMaterialCount: 0,
				cutPosition: 0,
				axisMin: 0,
				axisMax: 0,
				meaning: 'move cutting plane to inspect section'
			};
		}

		tempBounds.setFromObject( modelRoot );
		const axis = resolvePlaneAxis( tempBounds, currentPlaneMode );
		const axisMin = tempBounds.min[ axis ];
		const axisMax = tempBounds.max[ axis ];
		const cutPosition = THREE.MathUtils.lerp( axisMin, axisMax, nextValue / 100 );
		// Section cut moves a clipping plane through the model to inspect an interior section.
		// Unlike spatial reveal, value=100 still means "plane at far boundary", not "reveal complete".
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
			tempNormal.set( 0, 0, 0 ).setComponent( axisToIndex( axis ), -1 ),
			tempPoint.set( 0, 0, 0 ).setComponent( axisToIndex( axis ), cutPosition )
		);

		renderer.localClippingEnabled = true;
		let affectedMeshCount = 0;
		let affectedMaterialCount = 0;
		modelRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh === false ) {
				return;
			}

			rememberMeshSnapshot( meshSnapshots, child );
			restoreMeshSnapshot( meshSnapshots, child );
			affectedMeshCount += 1;

			forEachMaterial( child.material, ( material ) => {
				rememberMaterialSnapshot( materialSnapshots, material );
				material.clippingPlanes = [ plane.clone() ];
				material.clipIntersection = false;
				material.clipShadows = false;
				material.needsUpdate = true;
				affectedMaterialCount += 1;
			} );
		} );

		return {
			value: nextValue,
			planeMode: currentPlaneMode,
			axis,
			affectedMeshCount,
			affectedMaterialCount,
			cutPosition,
			axisMin,
			axisMax,
			meaning: 'move cutting plane to inspect section'
		};

	}

	function restore(): ArSectionCutRestoreResult {

		const result = currentRoot === null
			? {
				mode: 'section-cut' as const,
				restoredMaterialCount: 0,
				restoredMeshCount: 0,
				clearedClippingPlanes: renderer.localClippingEnabled
			}
			: restoreRoot( currentRoot );
		currentRoot = null;
		renderer.localClippingEnabled = false;
		return result;

	}

	function dispose(): void {

		restore();

	}

	function restoreRoot(modelRoot: THREE.Object3D): ArSectionCutRestoreResult {

		let restoredMaterialCount = 0;
		let restoredMeshCount = 0;
		modelRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh === false ) {
				return;
			}

			if ( restoreMeshSnapshot( meshSnapshots, child ) ) {
				restoredMeshCount += 1;
			}

			forEachMaterial( child.material, ( material ) => {
				if ( restoreMaterialSnapshot( materialSnapshots, material ) ) {
					restoredMaterialCount += 1;
				}
			} );
		} );

		return {
			mode: 'section-cut',
			restoredMaterialCount,
			restoredMeshCount,
			clearedClippingPlanes: true
		};

	}

	return {
		setPlaneMode,
		apply,
		restore,
		dispose
	};

}

function resolvePlaneAxis(bounds: THREE.Box3, planeMode: SectionCutPlaneMode): 'x' | 'y' | 'z' {

	bounds.getSize( tempSize );
	const mainAxis = tempSize.x >= tempSize.z ? 'x' : 'z';
	const secondaryAxis = mainAxis === 'x' ? 'z' : 'x';

	switch ( planeMode ) {
		case 'horizontal-section':
			return 'y';
		case 'cross-section':
			return mainAxis;
		case 'longitudinal-section':
			return secondaryAxis;
	}

}

function axisToIndex(axis: 'x' | 'y' | 'z'): 0 | 1 | 2 {

	switch ( axis ) {
		case 'x':
			return 0;
		case 'y':
			return 1;
		default:
			return 2;
	}

}
