import * as THREE from 'three';
import type { ModelLayerState } from '../../registration/registration-store.js';
import {
	forEachMaterial,
	rememberMaterialSnapshot,
	rememberMeshSnapshot,
	restoreMaterialSnapshot,
	restoreMeshSnapshot
} from './material-visualization-state.js';

export interface ArXrayLayerReport {
	layerId: string;
	layerIndex: number;
	layerName: string;
	opacity: number;
	visible: boolean;
}

export interface ArXrayApplyResult {
	value: number;
	opacityMode: 'uniform' | 'layered';
	totalLayerCount: number;
	affectedMeshCount: number;
	affectedMaterialCount: number;
	hasModelRoot: boolean;
	layerReports: ArXrayLayerReport[];
}

export interface ArXrayVisualizationController {
	apply(args: {
		modelRoot: THREE.Object3D | null;
		value: number;
		modelLayers: readonly ModelLayerState[];
	}): ArXrayApplyResult;
	restore(): void;
	captureVisibilityBaseline(modelRoot: THREE.Object3D | null): void;
	dispose(): void;
}

export function createArXrayVisualizationController(): ArXrayVisualizationController {

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
	let currentRoot: THREE.Object3D | null = null;
	let currentValue = 100;

	function apply(args: {
		modelRoot: THREE.Object3D | null;
		value: number;
		modelLayers: readonly ModelLayerState[];
	}): ArXrayApplyResult {

		const nextValue = clampPercentage( args.value );
		const previousRoot = currentRoot;
		const previousValue = currentValue;

		if ( previousRoot !== null && previousRoot !== args.modelRoot && previousValue < 100 ) {
			restoreRoot( previousRoot, materialSnapshots, meshSnapshots );
		}

		currentRoot = args.modelRoot;
		currentValue = nextValue;

		if ( args.modelRoot === null ) {
			return createApplyResult( nextValue, args.modelLayers.length, 0, 0, false );
		}

		if ( nextValue === 100 ) {
			const restoreReport = restoreRoot( args.modelRoot, materialSnapshots, meshSnapshots );
			return createApplyResult(
				nextValue,
				args.modelLayers.length,
				restoreReport.affectedMeshCount,
				restoreReport.affectedMaterialCount,
				true
			);
		}

		return applyTransparentXray( {
			modelRoot: args.modelRoot,
			value: nextValue,
			totalLayerCount: args.modelLayers.length,
			materialSnapshots,
			meshSnapshots
		} );

	}

	function restore(): void {

		if ( currentRoot !== null && currentValue < 100 ) {
			restoreRoot( currentRoot, materialSnapshots, meshSnapshots );
		}

		currentRoot = null;
		currentValue = 100;

	}

	function captureVisibilityBaseline(modelRoot: THREE.Object3D | null): void {

		if ( modelRoot === null ) {
			return;
		}

		modelRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh && shouldAffectMesh( child ) ) {
				rememberMeshSnapshot( meshSnapshots, child );
			}
		} );

	}

	return {
		apply,
		restore,
		captureVisibilityBaseline,
		dispose: restore
	};

}

export const createStructureRevealController = createArXrayVisualizationController;

function applyTransparentXray(options: {
	modelRoot: THREE.Object3D;
	value: number;
	totalLayerCount: number;
	materialSnapshots: WeakMap<THREE.Material, {
		transparent: boolean;
		opacity: number;
		depthWrite: boolean;
		depthTest: boolean;
		side: THREE.Side;
		clippingPlanes: THREE.Plane[] | null;
		clipIntersection: boolean;
		clipShadows: boolean;
	}>;
	meshSnapshots: WeakMap<THREE.Mesh, { visible: boolean }>;
}): ArXrayApplyResult {

	const {
		modelRoot,
		value,
		totalLayerCount,
		materialSnapshots,
		meshSnapshots
	} = options;
	const opacity = computeUniformOpacity( value );
	let affectedMeshCount = 0;
	let affectedMaterialCount = 0;

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false || shouldAffectMesh( child ) === false ) {
			return;
		}

		rememberMeshSnapshot( meshSnapshots, child );
		restoreMeshSnapshot( meshSnapshots, child );
		affectedMeshCount += 1;

		forEachMaterial( child.material, ( material ) => {
			rememberMaterialSnapshot( materialSnapshots, material );
			material.transparent = true;
			material.opacity = opacity;
			material.depthWrite = false;
			material.depthTest = true;
			material.side = materialSnapshots.get( material )?.side ?? material.side;
			material.needsUpdate = true;
			affectedMaterialCount += 1;
		} );
	} );

	return createApplyResult(
		value,
		totalLayerCount,
		affectedMeshCount,
		affectedMaterialCount,
		true
	);

}

function restoreRoot(
	modelRoot: THREE.Object3D,
	materialSnapshots: WeakMap<THREE.Material, {
		transparent: boolean;
		opacity: number;
		depthWrite: boolean;
		depthTest: boolean;
		side: THREE.Side;
		clippingPlanes: THREE.Plane[] | null;
		clipIntersection: boolean;
		clipShadows: boolean;
	}>,
	meshSnapshots: WeakMap<THREE.Mesh, { visible: boolean }>
): { affectedMeshCount: number; affectedMaterialCount: number } {

	let affectedMeshCount = 0;
	let affectedMaterialCount = 0;

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false || shouldAffectMesh( child ) === false ) {
			return;
		}

		if ( restoreMeshSnapshot( meshSnapshots, child ) ) {
			affectedMeshCount += 1;
		}

		forEachMaterial( child.material, ( material ) => {
			if ( restoreMaterialSnapshot( materialSnapshots, material ) ) {
				affectedMaterialCount += 1;
			}
		} );
	} );

	return {
		affectedMeshCount,
		affectedMaterialCount
	};

}

function shouldAffectMesh(mesh: THREE.Mesh): boolean {

	if (
		mesh.userData.__nonSelectableHelper === true
		|| mesh.userData.__excludeFromLayerIndex === true
		|| mesh.userData.__displayModeHelper === true
	) {
		return false;
	}

	const materialName = Array.isArray( mesh.material )
		? mesh.material.map( ( material ) => material.name ).join( '|' )
		: mesh.material.name;

	return materialName !== '__boundary-plane-highlight';

}

function computeUniformOpacity(value: number): number {

	return THREE.MathUtils.clamp( clampPercentage( value ) / 100, 0, 1 );

}

function clampPercentage(value: number): number {

	return THREE.MathUtils.clamp( Math.round( value ), 0, 100 );

}

function createApplyResult(
	value: number,
	totalLayerCount: number,
	affectedMeshCount: number,
	affectedMaterialCount: number,
	hasModelRoot: boolean
): ArXrayApplyResult {

	return {
		value,
		opacityMode: 'uniform',
		totalLayerCount,
		affectedMeshCount,
		affectedMaterialCount,
		hasModelRoot,
		layerReports: []
	};

}
