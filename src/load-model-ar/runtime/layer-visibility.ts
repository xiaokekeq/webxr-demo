import * as THREE from 'three';
import type { PipeRecord } from '../../load-model/types.js';
import type { ModelLayerState } from '../registration/registration-store.js';

interface LayerDefinition {
	id: string;
	label: string;
	orderIndex: number;
}

interface ManagedMaterialSnapshot {
	transparent: boolean;
	opacity: number;
	depthWrite: boolean;
	depthTest: boolean;
}

interface ManagedMaterialState {
	materials: THREE.Material[];
	snapshots: ManagedMaterialSnapshot[];
}

type NamedObjectGroups = Map<string, THREE.Object3D[]>;

export interface LayerVisibilityController {
	rebuild(options: {
		modelRoot: THREE.Object3D | null;
		pipesByName: Map<string, PipeRecord>;
	}): ModelLayerState[];
	hideTopLayer(): ModelLayerState[];
	restoreLastHiddenLayer(): ModelLayerState[];
	reset(): ModelLayerState[];
	getState(): ModelLayerState[];
	applyToRoot(root: THREE.Group | null): void;
}

const tempBounds = new THREE.Box3();
const tempObjectNames = new Map<string, THREE.Object3D[]>();
const tempObjectBounds = new THREE.Box3();

export function createLayerVisibilityController(): LayerVisibilityController {

	let layerDefinitions: LayerDefinition[] = [];
	let hiddenLayerIds: string[] = [];

	return {
		rebuild(options) {

			layerDefinitions = buildLayerDefinitions( options.modelRoot, options.pipesByName );
			hiddenLayerIds = [];
			return getState();

		},

		hideTopLayer() {

			const nextVisible = layerDefinitions.find( ( layer ) => hiddenLayerIds.includes( layer.id ) === false );
			if ( nextVisible !== undefined ) {
				hiddenLayerIds.push( nextVisible.id );
			}

			return getState();

		},

		restoreLastHiddenLayer() {

			hiddenLayerIds.pop();
			return getState();

		},

		reset() {

			hiddenLayerIds = [];
			return getState();

		},

		getState,

		applyToRoot(root) {

			if ( root === null ) {
				return;
			}

			const layerState = getState();
			const visibleLayers = layerState.filter( ( layer ) => layer.visible );
			const objectByName = indexNamedObjects( root );

			for ( const layer of layerState ) {
				const objects = objectByName.get( layer.id );
				if ( objects === undefined ) {
					continue;
				}

				for ( const object of objects ) {
					object.visible = true;
					object.userData.__layerHidden = layer.visible === false;
					object.traverse( ( child ) => {
						if ( child instanceof THREE.Mesh ) {
							applyMeshOpacity(
								child,
								layer.visible ? layer.opacity : 0,
								visibleLayers.length
							);
						}
					} );
				}
			}

		}
	};

	function getState(): ModelLayerState[] {

		const visibleIds = layerDefinitions
			.filter( ( layer ) => hiddenLayerIds.includes( layer.id ) === false )
			.map( ( layer ) => layer.id );
		const visibleCount = visibleIds.length;

		return layerDefinitions.map( ( layer ) => {
			const visible = hiddenLayerIds.includes( layer.id ) === false;
			const visibleIndex = visible ? visibleIds.indexOf( layer.id ) : -1;

			return {
				id: layer.id,
				label: layer.label,
				visible,
				opacity: visible
					? computeVisibleLayerOpacity( visibleIndex, visibleCount )
					: 0,
				orderIndex: layer.orderIndex
			};
		} );

	}

}

function buildLayerDefinitions(
	modelRoot: THREE.Object3D | null,
	pipesByName: Map<string, PipeRecord>
): LayerDefinition[] {

	if ( modelRoot === null ) {
		return [];
	}

	const objectByName = indexNamedObjects( modelRoot );
	const pipeLayers = Array.from( pipesByName.entries() )
		.map( ( [ name, properties ] ) => {
			const objects = objectByName.get( name );
			if ( objects === undefined ) {
				return null;
			}

			const bounds = tempBounds.makeEmpty();
			for ( const object of objects ) {
				tempObjectBounds.makeEmpty().setFromObject( object );
				if ( tempObjectBounds.isEmpty() ) {
					continue;
				}

				bounds.union( tempObjectBounds );
			}
			if ( bounds.isEmpty() ) {
				return null;
			}

			return {
				id: name,
				label: createLayerLabel( name, properties ),
				topY: bounds.max.y
			};
		} )
		.filter( ( item ): item is NonNullable<typeof item> => item !== null );

	if ( pipeLayers.length > 0 ) {
		return pipeLayers
			.sort( ( a, b ) => b.topY - a.topY )
			.map( ( layer, index ) => ( {
				id: layer.id,
				label: layer.label,
				orderIndex: index
			} ) );
	}

	return Array.from( objectByName.entries() )
		.map( ( [ name, objects ] ) => {
			const rootLevelObjects = objects.filter( ( object ) => object.parent === modelRoot && object.name.length > 0 );
			if ( rootLevelObjects.length === 0 ) {
				return null;
			}

			const bounds = tempBounds.makeEmpty();
			for ( const object of rootLevelObjects ) {
				tempObjectBounds.makeEmpty().setFromObject( object );
				if ( tempObjectBounds.isEmpty() ) {
					continue;
				}

				bounds.union( tempObjectBounds );
			}
			if ( bounds.isEmpty() ) {
				return null;
			}

			return {
				id: name,
				label: name,
				topY: bounds.max.y
			};
		} )
		.filter( ( item ): item is NonNullable<typeof item> => item !== null )
		.filter( ( item ) => Number.isFinite( item.topY ) )
		.sort( ( a, b ) => b.topY - a.topY )
		.map( ( layer, index ) => ( {
			id: layer.id,
			label: layer.label,
			orderIndex: index
		} ) );

}

function createLayerLabel(name: string, properties: PipeRecord): string {

	const depthLabel = normalizeLayerLabel( properties.depth );
	if ( depthLabel !== null ) {
		return depthLabel;
	}

	const typeLabel = normalizeLayerLabel( properties.type );
	if ( typeLabel !== null && typeLabel !== name ) {
		return `${name} · ${typeLabel}`;
	}

	return name;

}

function normalizeLayerLabel(value: string | undefined): string | null {

	if ( value === undefined ) {
		return null;
	}

	const trimmed = value.trim();
	if ( trimmed.length === 0 || trimmed === '--' || trimmed === '-' ) {
		return null;
	}

	return trimmed;

}

function indexNamedObjects(root: THREE.Object3D): NamedObjectGroups {

	tempObjectNames.clear();
	root.traverse( ( child ) => {
		if ( child.name.length > 0 ) {
			const group = tempObjectNames.get( child.name );
			if ( group === undefined ) {
				tempObjectNames.set( child.name, [ child ] );
				return;
			}

			group.push( child );
		}
	} );

	return new Map( tempObjectNames );

}

function applyMeshOpacity(mesh: THREE.Mesh, opacity: number, visibleLayerCount: number): void {

	const managedState = getOrCreateManagedMaterials( mesh );
	const useTransparency = visibleLayerCount > 1 || opacity < 0.999;

	managedState.materials.forEach( ( material, index ) => {
		const snapshot = managedState.snapshots[ index ];
		material.transparent = useTransparency || snapshot.transparent;
		material.opacity = opacity;
		material.depthWrite = useTransparency ? false : snapshot.depthWrite;
		material.depthTest = snapshot.depthTest;
		material.needsUpdate = true;
	} );

}

function getOrCreateManagedMaterials(
	mesh: THREE.Mesh
): ManagedMaterialState {

	if ( mesh.userData.__layerManagedMaterialState !== undefined ) {
		return mesh.userData.__layerManagedMaterialState as ManagedMaterialState;
	}

	const materials = Array.isArray( mesh.material ) ? mesh.material : [ mesh.material ];
	const clonedMaterials = materials.map( ( material ) => material.clone() );
	mesh.material = Array.isArray( mesh.material ) ? clonedMaterials : clonedMaterials[ 0 ];

	const snapshots = clonedMaterials.map( ( material ) => ( {
		transparent: material.transparent,
		opacity: material.opacity,
		depthWrite: material.depthWrite,
		depthTest: material.depthTest
	} ) );

	const managedState = {
		materials: clonedMaterials,
		snapshots
	};
	mesh.userData.__layerManagedMaterialState = managedState;
	return managedState;

}

function computeVisibleLayerOpacity(visibleIndex: number, visibleCount: number): number {

	if ( visibleCount <= 1 ) {
		return 1;
	}

	const startOpacity = 0.96;
	const endOpacity = 0.42;
	const ratio = visibleIndex / Math.max( visibleCount - 1, 1 );

	return THREE.MathUtils.lerp( startOpacity, endOpacity, ratio );

}
