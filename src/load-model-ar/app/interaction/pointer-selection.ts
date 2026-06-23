import * as THREE from 'three';
import type { PipeRecord } from '../../../load-model/types.js';
import type { WorkspaceMode } from '../../data/registration-store.js';
import type { ARSceneBundle } from '../../ui/types.js';
import type { PropertySelectionController } from './property-selection.js';

interface CreatePointerSelectionSessionOptions {
	sceneBundle: ARSceneBundle;
	propertySelection: PropertySelectionController;
	setStatus(message: string): void;
	onInspectSelection(): void;
	getPlacedModel(): THREE.Group | null;
	getWorkspaceMode(): WorkspaceMode;
	getPipesByName(): Map<string, PipeRecord>;
	dragThresholdPx?: number;
}

export interface PointerSelectionSession {
	handlePointerDown(event: PointerEvent): void;
	handlePointerUp(event: PointerEvent): void;
	handleScreenPointerDown(clientX: number, clientY: number): void;
	handleScreenPointerUp(clientX: number, clientY: number): void;
	handleArSelect(): void;
}

const DEFAULT_DRAG_THRESHOLD_PX = 10;

export function createPointerSelectionSession(
	options: CreatePointerSelectionSessionOptions
): PointerSelectionSession {

	const {
		sceneBundle,
		propertySelection,
		setStatus,
		onInspectSelection,
		getPlacedModel,
		getWorkspaceMode,
		getPipesByName,
		dragThresholdPx = DEFAULT_DRAG_THRESHOLD_PX
	} = options;

	const pointer = new THREE.Vector2();
	const pointerDownPosition = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();
	const xrRayOrigin = new THREE.Vector3();
	const xrRayDirection = new THREE.Vector3();
	let lastScreenSelectionTime = -Infinity;

	function handleScreenPointerDown(clientX: number, clientY: number): void {

		pointerDownPosition.set( clientX, clientY );

	}

	function handleScreenPointerUp(clientX: number, clientY: number): void {

		const placedModel = getPlacedModel();
		if ( placedModel === null ) {
			return;
		}

		const dragDistance = pointerDownPosition.distanceTo(
			new THREE.Vector2( clientX, clientY )
		);
		if ( dragDistance > dragThresholdPx ) {
			return;
		}

		const rect = sceneBundle.renderer.domElement.getBoundingClientRect();
		pointer.x = ( ( clientX - rect.left ) / rect.width ) * 2 - 1;
		pointer.y = - ( ( clientY - rect.top ) / rect.height ) * 2 + 1;

		raycaster.setFromCamera( pointer, sceneBundle.camera );
		lastScreenSelectionTime = performance.now();
		selectIntersections(
			raycaster.intersectObjects( placedModel.children, true ),
			placedModel
		);

	}

	return {
		handlePointerDown(event) {

			handleScreenPointerDown( event.clientX, event.clientY );

		},

		handlePointerUp(event) {

			handleScreenPointerUp( event.clientX, event.clientY );

		},

		handleScreenPointerDown,
		handleScreenPointerUp,

		handleArSelect() {

			if ( performance.now() - lastScreenSelectionTime < 240 ) {
				return;
			}

			const placedModel = getPlacedModel();
			if ( placedModel === null ) {
				return;
			}

			const xrCamera = sceneBundle.renderer.xr.getCamera();
			xrRayOrigin.setFromMatrixPosition( xrCamera.matrixWorld );
			xrRayDirection.set( 0, 0, -1 ).transformDirection( xrCamera.matrixWorld );
			raycaster.set( xrRayOrigin, xrRayDirection );

			selectIntersections(
				raycaster.intersectObjects( placedModel.children, true ),
				placedModel
			);

		}
	};

	function selectIntersections(
		intersections: THREE.Intersection[],
		placedModel: THREE.Group
	): void {

		if ( intersections.length === 0 ) {
			propertySelection.clearSelection();
			setStatus(
				sceneBundle.renderer.xr.isPresenting
					? 'No model part hit. Center the model and tap again.'
					: 'No model part selected.'
			);
			return;
		}

		const clickedMesh = intersections[ 0 ].object;
		const businessObject = propertySelection.resolveBusinessObject(
			clickedMesh,
			placedModel,
			getPipesByName()
		);
		const businessName = businessObject.name || clickedMesh.name || 'UnnamedObject';
		const properties = getPipesByName().get( businessName ) || null;
		propertySelection.selectBusinessObject( businessObject, properties );
		onInspectSelection();

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

}
