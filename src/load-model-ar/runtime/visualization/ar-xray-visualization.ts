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

const tempLayerReports = new Map<string, ArXrayLayerReport>();

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

		if ( nextValue === 0 ) {
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
			if ( child instanceof THREE.Mesh ) {
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
	const layerDescriptors = createLayerDescriptors( modelLayers );
	const canUseLayeredOpacity = layerDescriptors.size > 1;
	const opacityMode: ArXrayApplyResult['opacityMode'] = canUseLayeredOpacity ? 'layered' : 'uniform';
	let affectedMeshCount = 0;
	let affectedMaterialCount = 0;

	tempLayerReports.clear();

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh === false ) {
			return;
		}

		const mesh = child;
		rememberMesh( meshSnapshots, mesh );
		const meshSnapshot = meshSnapshots.get( mesh );
		if ( meshSnapshot === undefined ) {
			return;
		}

		const layerDescriptor = resolveLayerDescriptorForObject( mesh, layerDescriptors );
		const opacity = layerDescriptor === null || canUseLayeredOpacity === false
			? computeUniformOpacity( value )
			: computeLayeredOpacity( value, layerDescriptor.orderIndex, layerDescriptors.size );

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

		if ( layerDescriptor !== null && canUseLayeredOpacity ) {
			tempLayerReports.set( layerDescriptor.id, {
				layerId: layerDescriptor.id,
				layerIndex: layerDescriptor.orderIndex,
				layerName: layerDescriptor.label,
				opacity,
				visible: layerDescriptor.visible
			} );
		}
	} );

	return createApplyResult( {
		value,
		opacityMode,
		totalLayerCount: modelLayers.length,
		affectedMeshCount,
		affectedMaterialCount,
		hasModelRoot: true,
		layerReports: Array.from( tempLayerReports.values() ).sort( ( a, b ) => a.layerIndex - b.layerIndex )
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
		if ( child instanceof THREE.Mesh === false ) {
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

function computeUniformOpacity(value: number): number {

	const strength = clampPercentage( value ) / 100;
	return THREE.MathUtils.clamp( 1 - strength * 0.82, 0.18, 1 );

}

function computeLayeredOpacity(value: number, layerIndex: number, totalLayerCount: number): number {

	const strength = clampPercentage( value ) / 100;
	const layerRatio = layerIndex / Math.max( 1, totalLayerCount - 1 );
	const maxFade = 0.82 - layerRatio * 0.47;
	return THREE.MathUtils.clamp( 1 - strength * maxFade, 0.18, 1 );

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
