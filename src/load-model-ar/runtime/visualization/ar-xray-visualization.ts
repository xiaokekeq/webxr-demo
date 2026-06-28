import * as THREE from 'three';

interface MaterialSnapshot {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	depthTest: boolean;
}

interface MeshSnapshot {
	visible: boolean;
}

export interface StructureRevealReport {
	value: number;
	opacity: number;
	affectedMeshCount: number;
	affectedMaterialCount: number;
	hiddenAtZero: boolean;
	hasModelRoot: boolean;
}

export interface StructureRevealController {
	sync(modelRoot: THREE.Object3D | null, value: number): StructureRevealReport;
	captureVisibilityBaseline(modelRoot: THREE.Object3D | null): void;
	reset(): void;
	dispose(): void;
}

export function applyStructureRevealValue(
	modelRoot: THREE.Object3D,
	value: number
): StructureRevealReport {

	return applyRevealToRoot( {
		modelRoot,
		value: clampRevealValue( value ),
		materialSnapshots: new WeakMap<THREE.Material, MaterialSnapshot>(),
		meshSnapshots: new WeakMap<THREE.Mesh, MeshSnapshot>()
	} );

}

export function createStructureRevealController(): StructureRevealController {

	const materialSnapshots = new WeakMap<THREE.Material, MaterialSnapshot>();
	const meshSnapshots = new WeakMap<THREE.Mesh, MeshSnapshot>();
	let currentRoot: THREE.Object3D | null = null;
	let currentValue = 100;

	function sync(modelRoot: THREE.Object3D | null, value: number): StructureRevealReport {

		const nextValue = clampRevealValue( value );
		const previousRoot = currentRoot;
		const previousValue = currentValue;

		if ( previousRoot !== null && previousRoot !== modelRoot && previousValue < 100 ) {
			restoreRevealOnRoot( previousRoot, materialSnapshots, meshSnapshots );
		}

		currentRoot = modelRoot;
		currentValue = nextValue;

		if ( modelRoot === null ) {
			return createReport( {
				value: nextValue,
				affectedMeshCount: 0,
				affectedMaterialCount: 0,
				hasModelRoot: false
			} );
		}

		if ( nextValue >= 100 ) {
			if ( previousRoot === modelRoot && previousValue < 100 ) {
				const restoreReport = restoreRevealOnRoot( modelRoot, materialSnapshots, meshSnapshots );
				return createReport( {
					value: nextValue,
					affectedMeshCount: restoreReport.affectedMeshCount,
					affectedMaterialCount: restoreReport.affectedMaterialCount,
					hasModelRoot: true
				} );
			}

			return createReport( {
				value: nextValue,
				affectedMeshCount: 0,
				affectedMaterialCount: 0,
				hasModelRoot: true
			} );
		}

		return applyRevealToRoot( {
			modelRoot,
			value: nextValue,
			materialSnapshots,
			meshSnapshots
		} );

	}

	function captureVisibilityBaseline(modelRoot: THREE.Object3D | null): void {

		if ( modelRoot === null ) {
			return;
		}

		modelRoot.traverse( ( child ) => {
			if ( child instanceof THREE.Mesh ) {
				meshSnapshots.set( child, { visible: child.visible } );
			}
		} );

	}

	function reset(): void {

		if ( currentRoot !== null && currentValue < 100 ) {
			restoreRevealOnRoot( currentRoot, materialSnapshots, meshSnapshots );
		}

		currentRoot = null;
		currentValue = 100;

	}

	return {
		sync,
		captureVisibilityBaseline,
		reset,
		dispose: reset
	};

}

function applyRevealToRoot(options: {
	modelRoot: THREE.Object3D;
	value: number;
	materialSnapshots: WeakMap<THREE.Material, MaterialSnapshot>;
	meshSnapshots: WeakMap<THREE.Mesh, MeshSnapshot>;
}): StructureRevealReport {

	const { modelRoot, value, materialSnapshots, meshSnapshots } = options;
	const clampedValue = clampRevealValue( value );
	const opacity = clampedValue === 0 ? 0 : Math.max( 0.12, clampedValue / 100 );
	let affectedMeshCount = 0;
	let affectedMaterialCount = 0;

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

		mesh.visible = clampedValue === 0 ? false : meshSnapshot.visible;
		affectedMeshCount += 1;

		forEachMaterial( mesh.material, ( material ) => {
			rememberMaterial( materialSnapshots, material );
			material.transparent = true;
			material.opacity = opacity;
			material.depthWrite = false;
			material.depthTest = true;
			material.needsUpdate = true;
			affectedMaterialCount += 1;
		} );
	} );

	return createReport( {
		value: clampedValue,
		opacity,
		affectedMeshCount,
		affectedMaterialCount,
		hasModelRoot: true
	} );

}

function restoreRevealOnRoot(
	modelRoot: THREE.Object3D,
	materialSnapshots: WeakMap<THREE.Material, MaterialSnapshot>,
	meshSnapshots: WeakMap<THREE.Mesh, MeshSnapshot>
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
			material.opacity = materialSnapshot.opacity;
			material.depthWrite = materialSnapshot.depthWrite;
			material.depthTest = materialSnapshot.depthTest;
			material.needsUpdate = true;
			affectedMaterialCount += 1;
		} );
	} );

	return {
		affectedMeshCount,
		affectedMaterialCount
	};

}

function rememberMaterial(
	materialSnapshots: WeakMap<THREE.Material, MaterialSnapshot>,
	material: THREE.Material
): void {

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

function rememberMesh(
	meshSnapshots: WeakMap<THREE.Mesh, MeshSnapshot>,
	mesh: THREE.Mesh
): void {

	if ( meshSnapshots.has( mesh ) ) {
		return;
	}

	meshSnapshots.set( mesh, { visible: mesh.visible } );

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

function clampRevealValue(value: number): number {

	return THREE.MathUtils.clamp( Math.round( value ), 0, 100 );

}

function createReport(options: {
	value: number;
	opacity?: number;
	affectedMeshCount: number;
	affectedMaterialCount: number;
	hasModelRoot: boolean;
}): StructureRevealReport {

	return {
		value: options.value,
		opacity: options.opacity ?? ( options.value === 0 ? 0 : 1 ),
		affectedMeshCount: options.affectedMeshCount,
		affectedMaterialCount: options.affectedMaterialCount,
		hiddenAtZero: options.value === 0,
		hasModelRoot: options.hasModelRoot
	};

}
