import * as THREE from 'three';
import type { PipeRecord } from '../../../load-model/types.js';
import type { WorkspaceMode } from '../../data/registration-store.js';
import type { ARSceneBundle } from '../../ui/types.js';
import type { PropertySelectionController } from './property-selection.js';

interface CreatePointerSelectionSessionOptions {
	sceneBundle: ARSceneBundle;
	propertySelection: PropertySelectionController;
	setStatus(message: string): void;
	getPlacedModel(): THREE.Group | null;
	getWorkspaceMode(): WorkspaceMode;
	getPipesByName(): Map<string, PipeRecord>;
	dragThresholdPx?: number;
}

export interface PointerSelectionSession {
	handlePointerDown(event: PointerEvent): void;
	handlePointerUp(event: PointerEvent): void;
}

const DEFAULT_DRAG_THRESHOLD_PX = 10;

export function createPointerSelectionSession(
	options: CreatePointerSelectionSessionOptions
): PointerSelectionSession {

	const {
		sceneBundle,
		propertySelection,
		setStatus,
		getPlacedModel,
		getWorkspaceMode,
		getPipesByName,
		dragThresholdPx = DEFAULT_DRAG_THRESHOLD_PX
	} = options;

	const pointer = new THREE.Vector2();
	const pointerDownPosition = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();

	return {
		handlePointerDown(event) {

			pointerDownPosition.set( event.clientX, event.clientY );

		},

		handlePointerUp(event) {

			const placedModel = getPlacedModel();
			if ( placedModel === null ) {
				return;
			}

			const dragDistance = pointerDownPosition.distanceTo(
				new THREE.Vector2( event.clientX, event.clientY )
			);
			if ( dragDistance > dragThresholdPx ) {
				return;
			}

			const rect = sceneBundle.renderer.domElement.getBoundingClientRect();
			pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
			pointer.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

			raycaster.setFromCamera( pointer, sceneBundle.camera );
			const intersects = raycaster.intersectObjects( placedModel.children, true );

			if ( intersects.length === 0 ) {
				propertySelection.clearSelection();
				setStatus( 'No model part selected.' );
				return;
			}

			const clickedMesh = intersects[ 0 ].object;
			const businessObject = propertySelection.resolveBusinessObject(
				clickedMesh,
				placedModel,
				getPipesByName()
			);
			const businessName = businessObject.name || clickedMesh.name || 'UnnamedObject';
			const properties = getPipesByName().get( businessName ) || null;
			propertySelection.selectBusinessObject( businessObject, properties );

			if ( getWorkspaceMode() === 'browse' ) {
				setStatus(
					properties
						? `Selected ${businessName}.`
						: `Selected ${businessName}, but no matching business attributes were found.`
				);
				return;
			}

			setStatus( `Selected ${businessName}. Switch to browse mode to inspect properties.` );

		}
	};

}
