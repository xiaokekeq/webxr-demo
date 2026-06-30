import * as THREE from 'three';
import type { ModelLayerState } from '../../registration/registration-store.js';

export interface ArXrayMaterialSnapshot {
	material: THREE.Material;
	transparent: boolean;
	opacity?: number;
	depthWrite: boolean;
	depthTest: boolean;
	side: THREE.Side;
}

export interface ArXrayMeshSnapshot {
	mesh: THREE.Mesh;
	visible: boolean;
}

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

interface LayerDescriptor {
	id: string;
	label: string;
	orderIndex: number;
	visible: boolean;
}

interface LayeredXrayVisualState {
	opacity: number;
	depthWrite: boolean;
}

interface FallbackMeshLayerDescriptor {
	orderIndex: number;
	totalCount: number;
}

interface FallbackMeshLayerResolution {
	descriptors: WeakMap<THREE.Mesh, FallbackMeshLayerDescriptor>;
	totalCount: number;
}

const tempLayerReports = new Map<string, ArXrayLayerReport>();
const tempMeshBounds = new THREE.Box3();
const tempMeshCenter = new THREE.Vector3();

export function createArXrayVisualizationController(): ArXrayVisualizationController {

	const materialSnapshots = new WeakMap<THREE.Material, ArXrayMaterialSnapshot>();
	const meshSnapshots = new WeakMap<THREE.Mesh, ArXrayMeshSnapshot>();
	let currentRoot: THREE.Object3D | null = null;
	let currentValue = 0;

	function apply(args: {
		modelRoot: THREE.Object3D | null;
		value: number;
		modelLayers: readonly ModelLayerState[];
	}): ArXrayApplyResult {

		const nextValue = clampPercentage( args.value );
		const previousRoot = currentRoot;
		const previousValue = currentValue;

		if ( previousRoot !== null && previousRoot !== args.modelRoot && previousValue > 0 ) {
			restoreRoot( previousRoot, materialSnapshots, meshSnapshots );
		}

		currentRoot = args.modelRoot;
		currentValue = nextValue;

		if ( args.modelRoot === null ) {
			return createApplyResult( {
				value: nextValue,
				opacityMode: 'uniform',
				totalLayerCount: args.modelLayers.length,
				affectedMeshCount: 0,
				affectedMaterialCount: 0,
				hasModelRoot: false,
				layerReports: []
			} );
		}

		if ( nextValue === 100 ) {
			const restoreReport = restoreRoot( args.modelRoot, materialSnapshots, meshSnapshots );
			return createApplyResult( {
				value: nextValue,
				opacityMode: 'uniform',
				totalLayerCount: args.modelLayers.length,
				affectedMeshCount: restoreReport.affectedMeshCount,
				affectedMaterialCount: restoreReport.affectedMaterialCount,
				hasModelRoot: true,
				layerReports: []
			} );
		}

		return applyXrayToRoot( {
			modelRoot: args.modelRoot,
			value: nextValue,
			modelLayers: args.modelLayers,
			materialSnapshots,
			meshSnapshots
		} );

	}

	function restore(): void {

		if ( currentRoot !== null && currentValue > 0 ) {
			restoreRoot( currentRoot, materialSnapshots, meshSnapshots );
		}

		currentRoot = null;
		currentValue = 0;

	}

	function captureVisibilityBaseline(modelRoot: THREE.Object3D | null): void {

		if ( modelRoot === null ) {
			return;
		}

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh && shouldAffectMesh( child ) ) {
			meshSnapshots.set( child, {
				mesh: child,
				visible: child.visible
			} );
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

function applyXrayToRoot(options: {
	modelRoot: THREE.Object3D;
	value: number;
	modelLayers: readonly ModelLayerState[];
	materialSnapshots: WeakMap<THREE.Material, ArXrayMaterialSnapshot>;
	meshSnapshots: WeakMap<THREE.Mesh, ArXrayMeshSnapshot>;
}): ArXrayApplyResult {

	const {
		modelRoot,
		value,
		modelLayers,
		materialSnapshots,
		meshSnapshots
	} = options;
	const opacity = computeUniformOpacity( value );
	let affectedMeshCount = 0;
	let affectedMaterialCount = 0;

	tempLayerReports.clear();

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false || shouldAffectMesh( child ) === false ) {
			return;
		}

		const mesh = child;
		rememberMesh( meshSnapshots, mesh );
		const meshSnapshot = meshSnapshots.get( mesh );
		if ( meshSnapshot === undefined ) {
			return;
		}

		// Slider controls transparent xray; manual buttons continue to control layer visibility.
		mesh.visible = meshSnapshot.visible;
		affectedMeshCount += 1;

		forEachMaterial( mesh.material, ( material ) => {
			rememberMaterial( materialSnapshots, material );
			material.transparent = true;
			material.opacity = opacity;
			material.depthWrite = false;
			material.depthTest = true;
			material.side = materialSnapshots.get( material )?.side ?? material.side;
			material.needsUpdate = true;
			affectedMaterialCount += 1;
		} );
	} );

	return createApplyResult( {
		value,
		opacityMode: 'uniform',
		totalLayerCount: modelLayers.length,
		affectedMeshCount,
		affectedMaterialCount,
		hasModelRoot: true,
		layerReports: []
	} );

}

function restoreRoot(
	modelRoot: THREE.Object3D,
	materialSnapshots: WeakMap<THREE.Material, ArXrayMaterialSnapshot>,
	meshSnapshots: WeakMap<THREE.Mesh, ArXrayMeshSnapshot>
): { affectedMeshCount: number; affectedMaterialCount: number } {

	let affectedMeshCount = 0;
	let affectedMaterialCount = 0;

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false || shouldAffectMesh( child ) === false ) {
			return;
		}

		const mesh = child;
		const meshSnapshot = meshSnapshots.get( mesh );
		if ( meshSnapshot !== undefined ) {
			mesh.visible = meshSnapshot.visible;
			affectedMeshCount += 1;
		}

		forEachMaterial( mesh.material, ( material ) => {
			const materialSnapshot = materialSnapshots.get( material );
			if ( materialSnapshot === undefined ) {
				return;
			}

			material.transparent = materialSnapshot.transparent;
			material.opacity = materialSnapshot.opacity ?? 1;
			material.depthWrite = materialSnapshot.depthWrite;
			material.depthTest = materialSnapshot.depthTest;
			material.side = materialSnapshot.side;
			material.needsUpdate = true;
			affectedMaterialCount += 1;
		} );
	} );

	return {
		affectedMeshCount,
		affectedMaterialCount
	};

}

function createLayerDescriptors(modelLayers: readonly ModelLayerState[]): Map<string, LayerDescriptor> {

	return new Map(
		modelLayers.map( ( layer ) => [
			layer.id,
			{
				id: layer.id,
				label: layer.label,
				orderIndex: layer.orderIndex,
				visible: layer.visible
			}
		] )
	);

}

function resolveLayerDescriptorForObject(
	object: THREE.Object3D,
	layerDescriptors: Map<string, LayerDescriptor>
): LayerDescriptor | null {

	let current: THREE.Object3D | null = object;
	while ( current !== null ) {
		const layerId = current.userData.__layerId;
		if ( typeof layerId === 'string' && layerDescriptors.has( layerId ) ) {
			return layerDescriptors.get( layerId ) ?? null;
		}
		current = current.parent;
	}

	return null;

}

function buildFallbackMeshLayerDescriptors(modelRoot: THREE.Object3D): FallbackMeshLayerResolution {

	const rankedMeshes: Array<{ mesh: THREE.Mesh; centerY: number }> = [];
	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false || shouldAffectMesh( child ) === false ) {
			return;
		}

		child.updateWorldMatrix( true, false );
		tempMeshBounds.setFromObject( child );
		if ( tempMeshBounds.isEmpty() ) {
			return;
		}

		tempMeshBounds.getCenter( tempMeshCenter );
		rankedMeshes.push( {
			mesh: child,
			centerY: tempMeshCenter.y
		} );
	} );

	rankedMeshes.sort( ( a, b ) => b.centerY - a.centerY );
	const descriptors = new WeakMap<THREE.Mesh, FallbackMeshLayerDescriptor>();
	for ( let index = 0; index < rankedMeshes.length; index += 1 ) {
		descriptors.set( rankedMeshes[ index ].mesh, {
			orderIndex: index,
			totalCount: rankedMeshes.length
		} );
	}

	return {
		descriptors,
		totalCount: rankedMeshes.length
	};

}

function computeUniformOpacity(value: number): number {

	return THREE.MathUtils.clamp( clampPercentage( value ) / 100, 0, 1 );

}

function computeLayeredOpacity(value: number, layerIndex: number, totalLayerCount: number): number {

	return computeLayeredVisualState( value, layerIndex, totalLayerCount ).opacity;

}

function computeLayeredVisualState(
	value: number,
	layerIndex: number,
	totalLayerCount: number
): LayeredXrayVisualState {

	const strength = Math.pow( clampPercentage( value ) / 100, 0.78 );
	const layerRatio = layerIndex / Math.max( 1, totalLayerCount - 1 );
	const excavationBias = 1 - layerRatio;
	const opacityFloor = THREE.MathUtils.lerp( 0.04, 0.82, Math.pow( layerRatio, 0.7 ) );
	const maxFade = 0.92 - layerRatio * 0.78;
	const opacity = THREE.MathUtils.clamp(
		1 - strength * ( maxFade + excavationBias * 0.12 ),
		opacityFloor,
		1
	);

	return {
		opacity,
		depthWrite: opacity >= 0.72
	};

}

function rememberMaterial(
	materialSnapshots: WeakMap<THREE.Material, ArXrayMaterialSnapshot>,
	material: THREE.Material
): void {

	if ( materialSnapshots.has( material ) ) {
		return;
	}

	materialSnapshots.set( material, {
		material,
		transparent: material.transparent,
		opacity: material.opacity,
		depthWrite: material.depthWrite,
		depthTest: material.depthTest,
		side: material.side
	} );

}

function rememberMesh(
	meshSnapshots: WeakMap<THREE.Mesh, ArXrayMeshSnapshot>,
	mesh: THREE.Mesh
): void {

	if ( meshSnapshots.has( mesh ) ) {
		return;
	}

	meshSnapshots.set( mesh, {
		mesh,
		visible: mesh.visible
	} );

}

function shouldAffectMesh(mesh: THREE.Mesh): boolean {

	if ( mesh.userData.__nonSelectableHelper === true || mesh.userData.__excludeFromLayerIndex === true ) {
		return false;
	}

	const materialName = Array.isArray( mesh.material )
		? mesh.material.map( ( material ) => material.name ).join( '|' )
		: mesh.material.name;

	return materialName !== '__boundary-plane-highlight';

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

function clampPercentage(value: number): number {

	return THREE.MathUtils.clamp( Math.round( value ), 0, 100 );

}

function createApplyResult(options: ArXrayApplyResult): ArXrayApplyResult {

	return options;

}
