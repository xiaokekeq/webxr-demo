import * as THREE from 'three';
import {
	forEachMaterial,
	rememberMaterialSnapshot,
	rememberMeshSnapshot,
	restoreMaterialSnapshot,
	restoreMeshSnapshot
} from './material-visualization-state.js';

export interface ArSpatialRevealApplyResult {
	value: number;
	axis: 'x' | 'y' | 'z';
	direction: 1 | -1;
	affectedMeshCount: number;
	affectedMaterialCount: number;
	modelMin: number;
	modelMax: number;
	revealPosition: number;
}

export interface ArSpatialRevealRestoreResult {
	mode: 'spatial-reveal';
	restoredMaterialCount: number;
	restoredMeshCount: number;
	clearedClippingPlanes: boolean;
}

export interface ArSpatialRevealController {
	apply(modelRoot: THREE.Object3D | null, value: number): ArSpatialRevealApplyResult;
	restore(): ArSpatialRevealRestoreResult;
	dispose(): void;
}

const tempBounds = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempPoint = new THREE.Vector3();
const tempPlaneNormal = new THREE.Vector3();
const tempPlane = new THREE.Plane();

export function createArSpatialRevealController(renderer: THREE.WebGLRenderer): ArSpatialRevealController {

	const materialSnapshots = new WeakMap<THREE.Material, ReturnType<typeof buildMaterialSnapshot>>();
	const meshSnapshots = new WeakMap<THREE.Mesh, { visible: boolean }>();
	let currentRoot: THREE.Object3D | null = null;
	let currentValue = 100;

	function apply(modelRoot: THREE.Object3D | null, value: number): ArSpatialRevealApplyResult {

		const nextValue = THREE.MathUtils.clamp( Math.round( value ), 0, 100 );
		if ( currentRoot !== null && currentRoot !== modelRoot ) {
			restoreRoot( currentRoot );
		}

		currentRoot = modelRoot;
		currentValue = nextValue;

		if ( modelRoot === null ) {
			renderer.localClippingEnabled = false;
			return {
				value: nextValue,
				axis: 'x',
				direction: 1,
				affectedMeshCount: 0,
				affectedMaterialCount: 0,
				modelMin: 0,
				modelMax: 0,
				revealPosition: 0
			};
		}

		if ( nextValue >= 100 ) {
			restoreRoot( modelRoot );
			return createReport( modelRoot, nextValue, 'x', 1, 0, 0, 0, 0, 0 );
		}

		tempBounds.setFromObject( modelRoot );
		const { axis, direction } = resolveRevealAxis( tempBounds );
		const modelMin = tempBounds.min[ axis ];
		const modelMax = tempBounds.max[ axis ];
		const revealPosition = THREE.MathUtils.lerp( modelMin, modelMax, nextValue / 100 );
		const plane = tempPlane.setFromNormalAndCoplanarPoint(
			tempPlaneNormal.setScalar( 0 ).setComponent( axisToIndex( axis ), -direction ),
			tempPoint.set( 0, 0, 0 ).setComponent( axisToIndex( axis ), revealPosition )
		).clone();

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

		return createReport(
			modelRoot,
			nextValue,
			axis,
			direction,
			affectedMeshCount,
			affectedMaterialCount,
			modelMin,
			modelMax,
			revealPosition
		);

	}

	function restore(): ArSpatialRevealRestoreResult {

		const result = currentRoot === null
			? {
				mode: 'spatial-reveal' as const,
				restoredMaterialCount: 0,
				restoredMeshCount: 0,
				clearedClippingPlanes: renderer.localClippingEnabled
			}
			: restoreRoot( currentRoot );
		currentRoot = null;
		currentValue = 100;
		renderer.localClippingEnabled = false;
		return result;

	}

	function dispose(): void {

		restore();

	}

	function restoreRoot(modelRoot: THREE.Object3D): ArSpatialRevealRestoreResult {

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
			mode: 'spatial-reveal',
			restoredMaterialCount,
			restoredMeshCount,
			clearedClippingPlanes: true
		};

	}

	return {
		apply,
		restore,
		dispose
	};

}

function resolveRevealAxis(bounds: THREE.Box3): {
	axis: 'x' | 'y' | 'z';
	direction: 1 | -1;
} {

	bounds.getSize( tempSize );
	if ( tempSize.x >= tempSize.z && tempSize.x >= tempSize.y ) {
		return { axis: 'x', direction: 1 };
	}

	if ( tempSize.z >= tempSize.x && tempSize.z >= tempSize.y ) {
		return { axis: 'z', direction: 1 };
	}

	return { axis: 'y', direction: 1 };

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

function buildMaterialSnapshot(material: THREE.Material) {

	return {
		transparent: material.transparent,
		opacity: material.opacity,
		depthWrite: material.depthWrite,
		depthTest: material.depthTest,
		side: material.side,
		clippingPlanes: material.clippingPlanes?.map( ( plane ) => plane.clone() ) ?? null,
		clipIntersection: material.clipIntersection,
		clipShadows: material.clipShadows
	};

}

function createReport(
	modelRoot: THREE.Object3D | null,
	value: number,
	axis: 'x' | 'y' | 'z',
	direction: 1 | -1,
	affectedMeshCount: number,
	affectedMaterialCount: number,
	modelMin: number,
	modelMax: number,
	revealPosition: number
): ArSpatialRevealApplyResult {

	void modelRoot;
	return {
		value,
		axis,
		direction,
		affectedMeshCount,
		affectedMaterialCount,
		modelMin,
		modelMax,
		revealPosition
	};

}
