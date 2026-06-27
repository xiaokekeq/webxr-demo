import * as THREE from 'three';
import { createHighlightedMaterial, disposeDynamicMaterials } from '../../../../load-model/materials.js';
import type { PipeRecord } from '../../../../load-model/types.js';
import {
	createDefaultPropertyPanelState,
	type RegistrationStore
} from '../../../registration/registration-store.js';

interface CreatePropertySelectionControllerOptions {
	store: RegistrationStore;
	shouldRenderSelectionOutline?(): boolean;
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
		properties: PipeRecord | null,
		highlightObject?: THREE.Object3D
	): PropertySelectionResult;
}

export function createPropertySelectionController(
	options: CreatePropertySelectionControllerOptions
): PropertySelectionController {

	const { store } = options;
	let selectedMeshes: THREE.Mesh[] = [];
	let selectedOutlines: THREE.LineSegments[] = [];
	const shouldRenderSelectionOutline = options.shouldRenderSelectionOutline ?? ( () => false );

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

				if ( current.userData.__layerSelectable === true ) {
					return current;
				}

				if ( current.name && pipesByName.has( current.name ) ) {
					return current;
				}

				current = current.parent;
			}

			return fallback;

		},

		selectBusinessObject(businessObject, properties, highlightObject) {

			clearSelection();

			const highlightRoot = highlightObject ?? businessObject;
			highlightRoot.traverse( ( child ) => {
				if ( child instanceof THREE.Mesh ) {
					selectedMeshes.push( child );
					child.userData.__originalMaterial = child.material;

					const materials = Array.isArray( child.material ) ? child.material : [ child.material ];
					const highlightedMaterials = materials.map( createHighlightedMaterial );
					child.material = Array.isArray( child.material ) ? highlightedMaterials : highlightedMaterials[ 0 ];

					if ( shouldRenderSelectionOutline() ) {
						const outline = createSelectionOutline( child );
						if ( outline !== null ) {
							child.add( outline );
							selectedOutlines.push( outline );
						}
					}
				}
			} );

			const businessName = getBusinessName( businessObject );
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

		for ( const outline of selectedOutlines ) {
			outline.removeFromParent();
			outline.geometry.dispose();

			if ( Array.isArray( outline.material ) ) {
				for ( const material of outline.material ) {
					material.dispose();
				}
			} else {
				outline.material.dispose();
			}
		}

		selectedOutlines = [];

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

	function createSelectionOutline(mesh: THREE.Mesh): THREE.LineSegments | null {

		if ( mesh.geometry === undefined ) {
			return null;
		}

		const outline = new THREE.LineSegments(
			new THREE.EdgesGeometry( mesh.geometry ),
			new THREE.LineBasicMaterial( {
				color: 0xffc107,
				depthTest: false,
				transparent: true,
				opacity: 0.98,
				toneMapped: false
			} )
		);

		outline.name = '__selection-outline';
		outline.renderOrder = 999;
		outline.frustumCulled = false;
		outline.raycast = () => {};

		return outline;

	}

	function getBusinessName(object: THREE.Object3D): string {

		const userDataBusinessName = object.userData.__businessName;
		if ( typeof userDataBusinessName === 'string' && userDataBusinessName.length > 0 ) {
			return userDataBusinessName;
		}

		return object.name || 'UnnamedObject';

	}

}



