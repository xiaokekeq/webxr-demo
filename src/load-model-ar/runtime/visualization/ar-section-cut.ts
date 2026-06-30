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

interface SectionCutMeshHelpers {
	backFaceStencil: THREE.Mesh;
	frontFaceStencil: THREE.Mesh;
}

const SECTION_CUT_TAGS = {
	stencilHelper: '__sectionCutStencilHelper',
	capPlane: '__sectionCutCapPlane'
} as const;

const SECTION_CUT_CAP_COLOR = 0xb6a48b;
const SECTION_CUT_CAP_OPACITY = 0.96;
const SECTION_CUT_CAP_PADDING = 0.02;
const tempBounds = new THREE.Box3();
const tempLocalBounds = new THREE.Box3();
const tempGeometryBounds = new THREE.Box3();
const tempWorldBoundsCorner = new THREE.Vector3();
const tempBoundsSize = new THREE.Vector3();
const tempPoint = new THREE.Vector3();
const tempPlaneNormal = new THREE.Vector3();
const tempLocalPlaneNormal = new THREE.Vector3();
const tempWorldQuaternion = new THREE.Quaternion();
const tempInverseRootMatrixWorld = new THREE.Matrix4();
const tempRelativeMatrix = new THREE.Matrix4();
const tempPlaneQuaternion = new THREE.Quaternion();
const unitPlaneGeometry = new THREE.PlaneGeometry( 1, 1 );
const unitPlaneNormal = new THREE.Vector3( 0, 0, 1 );

export function createArSectionCutController(renderer: THREE.WebGLRenderer): ArSectionCutController {

	const materialSnapshots = new WeakMap<THREE.Material, {
		transparent: boolean;
		opacity: number;
		depthWrite: boolean;
		depthTest: boolean;
		side: THREE.Side;
		clippingPlanes: THREE.Plane[] | null;
		clipIntersection: boolean;
		clipShadows: boolean;
	}>();
	const meshSnapshots = new WeakMap<THREE.Mesh, { visible: boolean }>();
	const meshHelpers = new WeakMap<THREE.Mesh, SectionCutMeshHelpers>();
	const rootCapPlanes = new WeakMap<THREE.Object3D, THREE.Mesh>();
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
				meaning: 'move cutting plane to inspect section with cap fill'
			};
		}

		tempBounds.setFromObject( modelRoot );
		const localBounds = resolveModelLocalBounds( modelRoot );
		const axis = resolvePlaneAxis( localBounds, currentPlaneMode );
		const axisMin = localBounds.min[ axis ];
		const axisMax = localBounds.max[ axis ];
		const cutPosition = THREE.MathUtils.lerp( axisMin, axisMax, nextValue / 100 );
		const plane = createWorldSectionPlane( modelRoot, tempBounds, axis, nextValue / 100 );

		renderer.localClippingEnabled = true;
		let affectedMeshCount = 0;
		let affectedMaterialCount = 0;

		modelRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh === false || shouldProcessSectionCutMesh( child ) === false ) {
				return;
			}

			rememberMeshSnapshot( meshSnapshots, child );
			restoreMeshSnapshot( meshSnapshots, child );
			affectedMeshCount += 1;

			forEachMaterial( child.material, ( material ) => {
				rememberMaterialSnapshot( materialSnapshots, material );
				material.side = THREE.DoubleSide;
				material.clippingPlanes = [ plane.clone() ];
				material.clipIntersection = false;
				material.clipShadows = false;
				material.needsUpdate = true;
				affectedMaterialCount += 1;
			} );

			const helpers = ensureMeshHelpers( child, plane );
			applyPlaneToStencilHelpers( helpers, plane );
		} );

		ensureCapPlane( modelRoot, axis, cutPosition, localBounds );

		return {
			value: nextValue,
			planeMode: currentPlaneMode,
			axis,
			affectedMeshCount,
			affectedMaterialCount,
			cutPosition,
			axisMin,
			axisMax,
			meaning: 'move cutting plane to inspect section with cap fill'
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

	function ensureMeshHelpers(mesh: THREE.Mesh, plane: THREE.Plane): SectionCutMeshHelpers {

		const existing = meshHelpers.get( mesh );
		if ( existing !== undefined ) {
			return existing;
		}

		const backFaceStencil = createStencilHelperMesh(
			mesh.geometry,
			THREE.BackSide,
			THREE.IncrementWrapStencilOp,
			plane
		);
		const frontFaceStencil = createStencilHelperMesh(
			mesh.geometry,
			THREE.FrontSide,
			THREE.DecrementWrapStencilOp,
			plane
		);

		mesh.add( backFaceStencil );
		mesh.add( frontFaceStencil );

		const helpers = {
			backFaceStencil,
			frontFaceStencil
		};
		meshHelpers.set( mesh, helpers );
		return helpers;

	}

	function applyPlaneToStencilHelpers(helpers: SectionCutMeshHelpers, plane: THREE.Plane): void {

		const materials = [ helpers.backFaceStencil.material, helpers.frontFaceStencil.material ];
		for ( const material of materials ) {
			material.clippingPlanes = [ plane.clone() ];
			material.needsUpdate = true;
		}

	}

	function ensureCapPlane(
		modelRoot: THREE.Object3D,
		axis: 'x' | 'y' | 'z',
		cutPosition: number,
		bounds: THREE.Box3
	): void {

		let capPlane = rootCapPlanes.get( modelRoot );
		if ( capPlane === undefined ) {
			capPlane = createCapPlaneMesh( renderer );
			rootCapPlanes.set( modelRoot, capPlane );
			modelRoot.add( capPlane );
		}

		const { width, height } = resolveCapPlaneSize( bounds, axis );
		capPlane.scale.set( width + SECTION_CUT_CAP_PADDING, height + SECTION_CUT_CAP_PADDING, 1 );
		capPlane.position.copy( bounds.getCenter( tempPoint ) );
		capPlane.position[ axis ] = cutPosition;
		capPlane.quaternion.copy(
			tempPlaneQuaternion.setFromUnitVectors(
				unitPlaneNormal,
				tempLocalPlaneNormal.set( 0, 0, 0 ).setComponent( axisToIndex( axis ), 1 )
			)
		);
	}

	function restoreRoot(modelRoot: THREE.Object3D): ArSectionCutRestoreResult {

		let restoredMaterialCount = 0;
		let restoredMeshCount = 0;
		modelRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh === false || shouldProcessSectionCutMesh( child ) === false ) {
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

			removeMeshHelpers( child );
		} );

		removeCapPlane( modelRoot );

		return {
			mode: 'section-cut',
			restoredMaterialCount,
			restoredMeshCount,
			clearedClippingPlanes: true
		};

	}

	function removeMeshHelpers(mesh: THREE.Mesh): void {

		const helpers = meshHelpers.get( mesh );
		if ( helpers === undefined ) {
			return;
		}

		for ( const helper of [ helpers.backFaceStencil, helpers.frontFaceStencil ] ) {
			helper.removeFromParent();
			if ( helper.material instanceof THREE.Material ) {
				helper.material.dispose();
			}
		}
		meshHelpers.delete( mesh );

	}

	function removeCapPlane(modelRoot: THREE.Object3D): void {

		const capPlane = rootCapPlanes.get( modelRoot );
		if ( capPlane === undefined ) {
			return;
		}

		capPlane.removeFromParent();
		if ( capPlane.material instanceof THREE.Material ) {
			capPlane.material.dispose();
		}
		rootCapPlanes.delete( modelRoot );

	}

	return {
		setPlaneMode,
		apply,
		restore,
		dispose
	};

}

function createStencilHelperMesh(
	geometry: THREE.BufferGeometry,
	side: THREE.Side,
	stencilZPass: THREE.StencilOp,
	plane: THREE.Plane
): THREE.Mesh {

	const material = new THREE.MeshBasicMaterial( {
		colorWrite: false,
		depthWrite: false,
		depthTest: true,
		side,
		clippingPlanes: [ plane.clone() ],
		stencilWrite: true,
		stencilFunc: THREE.AlwaysStencilFunc,
		stencilFail: THREE.KeepStencilOp,
		stencilZFail: THREE.KeepStencilOp,
		stencilZPass,
		toneMapped: false
	} );

	const mesh = new THREE.Mesh( geometry, material );
	mesh.name = '__section-cut-stencil-helper';
	mesh.renderOrder = 4;
	mesh.frustumCulled = false;
	mesh.raycast = () => {};
	mesh.userData[ SECTION_CUT_TAGS.stencilHelper ] = true;
	return mesh;

}

function createCapPlaneMesh(renderer: THREE.WebGLRenderer): THREE.Mesh {

	const material = new THREE.MeshStandardMaterial( {
		color: SECTION_CUT_CAP_COLOR,
		roughness: 1,
		metalness: 0,
		side: THREE.DoubleSide,
		transparent: true,
		opacity: SECTION_CUT_CAP_OPACITY,
		depthWrite: true,
		depthTest: true,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -2,
		stencilWrite: true,
		stencilFunc: THREE.NotEqualStencilFunc,
		stencilRef: 0,
		stencilFail: THREE.ReplaceStencilOp,
		stencilZFail: THREE.ReplaceStencilOp,
		stencilZPass: THREE.ReplaceStencilOp
	} );

	const mesh = new THREE.Mesh( unitPlaneGeometry, material );
	mesh.name = '__section-cut-cap-plane';
	mesh.renderOrder = 5;
	mesh.frustumCulled = false;
	mesh.raycast = () => {};
	mesh.userData[ SECTION_CUT_TAGS.capPlane ] = true;
	mesh.onAfterRender = () => {
		if ( typeof renderer.clearStencil === 'function' ) {
			renderer.clearStencil();
			return;
		}

		renderer.clear( false, false, true );
	};
	return mesh;

}

function createWorldSectionPlane(
	modelRoot: THREE.Object3D,
	worldBounds: THREE.Box3,
	axis: 'x' | 'y' | 'z',
	valueRatio: number
): THREE.Plane {

	modelRoot.updateWorldMatrix( true, true );
	const worldNormal = tempPlaneNormal
		.set( 0, 0, 0 )
		.setComponent( axisToIndex( axis ), -1 )
		.applyQuaternion( modelRoot.getWorldQuaternion( tempWorldQuaternion ) )
		.normalize();
	const projectedRange = resolveProjectedBoundsRange( worldBounds, worldNormal );
	const cutDistance = THREE.MathUtils.lerp( projectedRange.min, projectedRange.max, valueRatio );
	const worldPoint = worldNormal.clone().multiplyScalar( cutDistance );

	return new THREE.Plane().setFromNormalAndCoplanarPoint( worldNormal, worldPoint );

}

function resolveProjectedBoundsRange(
	bounds: THREE.Box3,
	normal: THREE.Vector3
): { min: number; max: number } {

	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;

	for ( const x of [ bounds.min.x, bounds.max.x ] ) {
		for ( const y of [ bounds.min.y, bounds.max.y ] ) {
			for ( const z of [ bounds.min.z, bounds.max.z ] ) {
				const projection = normal.dot( tempWorldBoundsCorner.set( x, y, z ) );
				if ( projection < min ) {
					min = projection;
				}
				if ( projection > max ) {
					max = projection;
				}
			}
		}
	}

	if ( Number.isFinite( min ) === false || Number.isFinite( max ) === false ) {
		return { min: 0, max: 0 };
	}

	return { min, max };

}

function resolveModelLocalBounds(modelRoot: THREE.Object3D): THREE.Box3 {

	modelRoot.updateWorldMatrix( true, true );
	tempLocalBounds.makeEmpty();
	tempInverseRootMatrixWorld.copy( modelRoot.matrixWorld ).invert();

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false || shouldProcessSectionCutMesh( child ) === false ) {
			return;
		}

		const geometry = child.geometry;
		if ( geometry.boundingBox === null ) {
			geometry.computeBoundingBox();
		}

		if ( geometry.boundingBox === null ) {
			return;
		}

		tempRelativeMatrix.multiplyMatrices( tempInverseRootMatrixWorld, child.matrixWorld );
		tempGeometryBounds.copy( geometry.boundingBox ).applyMatrix4( tempRelativeMatrix );
		tempLocalBounds.union( tempGeometryBounds );
	} );

	return tempLocalBounds;

}

function resolvePlaneAxis(bounds: THREE.Box3, planeMode: SectionCutPlaneMode): 'x' | 'y' | 'z' {

	bounds.getSize( tempBoundsSize );
	const mainAxis = tempBoundsSize.x >= tempBoundsSize.z ? 'x' : 'z';
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

function resolveCapPlaneSize(
	bounds: THREE.Box3,
	axis: 'x' | 'y' | 'z'
): { width: number; height: number } {

	bounds.getSize( tempBoundsSize );

	switch ( axis ) {
		case 'x':
			return {
				width: Math.max( 0.01, tempBoundsSize.z ),
				height: Math.max( 0.01, tempBoundsSize.y )
			};
		case 'y':
			return {
				width: Math.max( 0.01, tempBoundsSize.x ),
				height: Math.max( 0.01, tempBoundsSize.z )
			};
		case 'z':
		default:
			return {
				width: Math.max( 0.01, tempBoundsSize.x ),
				height: Math.max( 0.01, tempBoundsSize.y )
			};
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

function shouldProcessSectionCutMesh(mesh: THREE.Mesh): boolean {

	return mesh.userData[ SECTION_CUT_TAGS.stencilHelper ] !== true
		&& mesh.userData[ SECTION_CUT_TAGS.capPlane ] !== true
		&& mesh.userData.__displayModeHelper !== true
		&& mesh.userData.__nonSelectableHelper !== true
		&& mesh.userData.__excludeFromLayerIndex !== true;

}
