import * as THREE from 'three';
import type { DisplayMode, PipeRecord } from './types.js';

type EmissiveMaterial = THREE.Material & {
	emissive: THREE.Color;
	emissiveIntensity: number;
};

type ColorMaterial = THREE.Material & {
	color: THREE.Color;
};

const STRUCTURE_TYPE_COLORS: Record<string, number> = {
	'main-pipe': 0x2c7cff,
	'branch-pipe': 0x20b26b,
	"riser": 0xf2a93b,
	"terminal": 0xe85d75,
	'valve-section': 0x8c6bff,
	'joint-section': 0x00bcd4
};

export function cacheSourceMaterials(root: THREE.Object3D): void {

	root.traverse( ( child ) => {
		if ( isMesh( child ) ) {
			child.userData.__sourceMaterial = child.material;
		}
	} );

}

export function replaceMeshMaterialsForMode(
	mesh: THREE.Mesh,
	displayMode: DisplayMode,
	pipeRecord: PipeRecord | null
): void {

	disposeDynamicMaterials( mesh.material, mesh.userData.__sourceMaterial );

	const sourceMaterials = Array.isArray( mesh.userData.__sourceMaterial )
		? mesh.userData.__sourceMaterial
		: [ mesh.userData.__sourceMaterial ];

	const displayMaterials = sourceMaterials.map( ( material: THREE.Material ) => {
		const cloned = material.clone();
		applyMaterialMode( cloned, displayMode, pipeRecord );
		return cloned;
	} );

	mesh.material = Array.isArray( mesh.userData.__sourceMaterial ) ? displayMaterials : displayMaterials[ 0 ];

}

export function createHighlightedMaterial(material: THREE.Material): THREE.Material {

	const cloned = material.clone();
	if ( 'transparent' in cloned ) {
		cloned.transparent = false;
	}

	if ( 'opacity' in cloned && typeof cloned.opacity === 'number' ) {
		cloned.opacity = 1;
	}

	if ( 'depthWrite' in cloned ) {
		cloned.depthWrite = true;
	}

	if ( 'map' in cloned ) {
		cloned.map = null;
	}

	if ( hasEmissive( cloned ) ) {
		cloned.emissive = new THREE.Color( 0xffb300 );
		cloned.emissiveIntensity = 1.9;
	}

	if ( hasColor( cloned ) ) {
		cloned.color = new THREE.Color( 0xffd54f );
	}

	cloned.needsUpdate = true;
	return cloned;

}

export function disposeDynamicMaterials(
	currentMaterial: THREE.Material | THREE.Material[],
	sourceMaterial: THREE.Material | THREE.Material[]
): void {

	const currentMaterials = Array.isArray( currentMaterial ) ? currentMaterial : [ currentMaterial ];
	const sourceMaterials = Array.isArray( sourceMaterial ) ? sourceMaterial : [ sourceMaterial ];

	for ( const material of currentMaterials ) {
		if ( sourceMaterials.includes( material ) === false ) {
			material.dispose();
		}
	}

}

function applyMaterialMode(
	material: THREE.Material,
	displayMode: DisplayMode,
	pipeRecord: PipeRecord | null
): void {

	if ( displayMode === 'transparent' ) {
		material.transparent = true;
		material.opacity = 0.45;
		material.depthWrite = false;
	} else if ( displayMode === 'structure' ) {
		applyStructureMode( material, pipeRecord );
	} else {
		material.transparent = false;
		material.opacity = 1;
		material.depthWrite = true;
	}

	material.needsUpdate = true;

}

function applyStructureMode(material: THREE.Material, pipeRecord: PipeRecord | null): void {

	material.transparent = false;
	material.opacity = 1;
	material.depthWrite = true;

	if ( hasColor( material ) ) {
		material.color = new THREE.Color( getStructureColor( pipeRecord?.type ) );
	}

	if ( 'map' in material ) {
		material.map = null;
	}

	if ( 'metalness' in material && typeof material.metalness === 'number' ) {
		material.metalness = 0.08;
	}

	if ( 'roughness' in material && typeof material.roughness === 'number' ) {
		material.roughness = 0.78;
	}

}

function getStructureColor(type: string | undefined): number {

	if ( type === undefined ) {
		return 0x8ea4bd;
	}

	return STRUCTURE_TYPE_COLORS[ type ] ?? 0x8ea4bd;

}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {

	return object instanceof THREE.Mesh;

}

function hasEmissive(material: THREE.Material): material is EmissiveMaterial {

	return 'emissive' in material
		&& material.emissive instanceof THREE.Color
		&& 'emissiveIntensity' in material
		&& typeof material.emissiveIntensity === 'number';

}

function hasColor(material: THREE.Material): material is ColorMaterial {

	return 'color' in material && material.color instanceof THREE.Color;

}
