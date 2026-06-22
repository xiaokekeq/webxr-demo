import * as THREE from 'three';
import { createHighlightedMaterial, disposeDynamicMaterials } from '../../../load-model/materials.js';
import type { PipeRecord } from '../../../load-model/types.js';
import {
	createDefaultPropertyPanelState,
	type RegistrationStore
} from '../../data/registration-store.js';

interface CreatePropertySelectionControllerOptions {
	store: RegistrationStore;
}

export interface PropertySelectionResult {
	businessName: string;
	properties: PipeRecord | null;
}

export interface PropertySelectionController {
	clearSelection(): void;
	resolveBusinessObject(
		mesh: THREE.Object3D,
		placedModel: THREE.Group | null,
		pipesByName: Map<string, PipeRecord>
	): THREE.Object3D;
	selectBusinessObject(
		businessObject: THREE.Object3D,
		properties: PipeRecord | null
	): PropertySelectionResult;
}

export function createPropertySelectionController(
	options: CreatePropertySelectionControllerOptions
): PropertySelectionController {

	const { store } = options;
	let selectedMeshes: THREE.Mesh[] = [];

	return {
		clearSelection,

		resolveBusinessObject(mesh, placedModel, pipesByName) {

			if ( placedModel === null ) {
				return mesh;
			}

			let current: THREE.Object3D | null = mesh;
			let fallback = mesh;

			while ( current && current !== placedModel ) {
				if ( current.name ) {
					fallback = current;
				}

				if ( current.name && pipesByName.has( current.name ) ) {
					return current;
				}

				current = current.parent;
			}

			return fallback;

		},

		selectBusinessObject(businessObject, properties) {

			clearSelection();

			businessObject.traverse( ( child ) => {
				if ( child instanceof THREE.Mesh ) {
					selectedMeshes.push( child );
					child.userData.__originalMaterial = child.material;

					const materials = Array.isArray( child.material ) ? child.material : [ child.material ];
					const highlightedMaterials = materials.map( createHighlightedMaterial );
					child.material = Array.isArray( child.material ) ? highlightedMaterials : highlightedMaterials[ 0 ];
				}
			} );

			const businessName = businessObject.name || 'UnnamedObject';
			store.patch( {
				propertyPanel: {
					name: businessName,
					statusBadge: properties?.status || '待核查',
					type: properties?.type || '-',
					diameter: properties?.diameter || '-',
					material: properties?.material || '-',
					depth: properties?.depth || '-',
					status: properties?.status || '-',
					remark: properties?.remark || '未找到匹配的业务属性记录。'
				}
			} );

			return { businessName, properties };

		}
	};

	function clearSelection(): void {

		for ( const mesh of selectedMeshes ) {
			if ( mesh.userData.__originalMaterial ) {
				disposeDynamicMaterials( mesh.material, mesh.userData.__originalMaterial );
				mesh.material = mesh.userData.__originalMaterial;
				delete mesh.userData.__originalMaterial;
			}
		}

		selectedMeshes = [];
		store.patch( { propertyPanel: createDefaultPropertyPanelState() } );

	}

}
