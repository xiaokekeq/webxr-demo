import * as THREE from 'three';

export interface VisualizationMaterialSnapshot {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	depthTest: boolean;
	side: THREE.Side;
	clippingPlanes: THREE.Plane[] | null;
	clipIntersection: boolean;
	clipShadows: boolean;
}

export interface VisualizationMeshSnapshot {
	visible: boolean;
}

export function forEachMaterial(
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

export function rememberMaterialSnapshot(
	materialSnapshots: WeakMap<THREE.Material, VisualizationMaterialSnapshot>,
	material: THREE.Material
): void {

	if ( materialSnapshots.has( material ) ) {
		return;
	}

	materialSnapshots.set( material, {
		transparent: material.transparent,
		opacity: material.opacity,
		depthWrite: material.depthWrite,
		depthTest: material.depthTest,
		side: material.side,
		clippingPlanes: material.clippingPlanes?.map( ( plane ) => plane.clone() ) ?? null,
		clipIntersection: material.clipIntersection,
		clipShadows: material.clipShadows
	} );

}

export function restoreMaterialSnapshot(
	materialSnapshots: WeakMap<THREE.Material, VisualizationMaterialSnapshot>,
	material: THREE.Material
): boolean {

	const snapshot = materialSnapshots.get( material );
	if ( snapshot === undefined ) {
		return false;
	}

	material.transparent = snapshot.transparent;
	material.opacity = snapshot.opacity;
	material.depthWrite = snapshot.depthWrite;
	material.depthTest = snapshot.depthTest;
	material.side = snapshot.side;
	material.clippingPlanes = snapshot.clippingPlanes?.map( ( plane ) => plane.clone() ) ?? null;
	material.clipIntersection = snapshot.clipIntersection;
	material.clipShadows = snapshot.clipShadows;
	material.needsUpdate = true;
	return true;

}

export function rememberMeshSnapshot(
	meshSnapshots: WeakMap<THREE.Mesh, VisualizationMeshSnapshot>,
	mesh: THREE.Mesh
): void {

	if ( meshSnapshots.has( mesh ) ) {
		return;
	}

	meshSnapshots.set( mesh, {
		visible: mesh.visible
	} );

}

export function restoreMeshSnapshot(
	meshSnapshots: WeakMap<THREE.Mesh, VisualizationMeshSnapshot>,
	mesh: THREE.Mesh
): boolean {

	const snapshot = meshSnapshots.get( mesh );
	if ( snapshot === undefined ) {
		return false;
	}

	mesh.visible = snapshot.visible;
	return true;

}

