import * as THREE from 'three';
import type { PipeRecord } from '../../../../load-model/types.js';
import type { WorkspaceMode } from '../../../registration/registration-store.js';
import type { ARSceneBundle } from '../../../shared/types.js';
import type { PropertySelectionController } from './property-selection.js';

interface CreatePointerSelectionSessionOptions {
	sceneBundle: ARSceneBundle;
	propertySelection: PropertySelectionController;
	setStatus(message: string): void;
	onInspectSelection(): void;
	onSelectionApplied?(
		selection: {
			businessObject: THREE.Object3D;
			properties: PipeRecord | null;
			highlightObject?: THREE.Object3D;
		}
	): void;
	onSelectionCleared?(): void;
	handlePreSelectionRaycast?(
		selection: {
			raycaster: THREE.Raycaster;
			clientX: number;
			clientY: number;
			source: 'screen' | 'xr-select';
			placedModel: THREE.Group;
		}
	): boolean;
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
	suppressSelectionFor(durationMs: number): void;
	cancelPendingSelection(durationMs?: number): void;
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
		onSelectionApplied,
		onSelectionCleared,
		handlePreSelectionRaycast,
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
	let selectionSuppressedUntil = -Infinity;
	let hasPendingPointerSelection = false;

	function isSelectionSuppressed(): boolean {

		return performance.now() < selectionSuppressedUntil;

	}

	function cancelPendingSelection(durationMs = 360): void {

		hasPendingPointerSelection = false;
		selectionSuppressedUntil = Math.max(
			selectionSuppressedUntil,
			performance.now() + durationMs
		);

	}

	function handleScreenPointerDown(clientX: number, clientY: number): void {

		if ( isSelectionSuppressed() ) {
			return;
		}

		hasPendingPointerSelection = true;
		pointerDownPosition.set( clientX, clientY );

	}

	function handleScreenPointerUp(clientX: number, clientY: number): void {

		if ( isSelectionSuppressed() ) {
			hasPendingPointerSelection = false;
			return;
		}

		if ( hasPendingPointerSelection === false ) {
			return;
		}
		hasPendingPointerSelection = false;

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

		const activeCamera = sceneBundle.renderer.xr.isPresenting
			? sceneBundle.renderer.xr.getCamera()
			: sceneBundle.camera;
		raycaster.setFromCamera( pointer, activeCamera );
		lastScreenSelectionTime = performance.now();
		if ( handlePreSelectionRaycast?.( {
			raycaster,
			clientX,
			clientY,
			source: 'screen',
			placedModel
		} ) === true ) {
			return;
		}
		selectScreenPoint( clientX, clientY, placedModel );

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

			if ( isSelectionSuppressed() ) {
				return;
			}

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
			const canvasRect = sceneBundle.renderer.domElement.getBoundingClientRect();
			if ( handlePreSelectionRaycast?.( {
				raycaster,
				clientX: canvasRect.left + canvasRect.width / 2,
				clientY: canvasRect.top + canvasRect.height / 2,
				source: 'xr-select',
				placedModel
			} ) === true ) {
				return;
			}

			selectIntersections(
				raycaster.intersectObjects( placedModel.children, true ),
				placedModel,
				canvasRect.left + canvasRect.width / 2,
				canvasRect.top + canvasRect.height / 2,
				'xr-select'
			);

		},

		suppressSelectionFor(durationMs) {

			selectionSuppressedUntil = Math.max(
				selectionSuppressedUntil,
				performance.now() + durationMs
			);

		},

		cancelPendingSelection

	};

	function selectScreenPoint(
		clientX: number,
		clientY: number,
		placedModel: THREE.Group
	): void {

		selectIntersections(
			raycaster.intersectObjects( placedModel.children, true ),
			placedModel,
			clientX,
			clientY,
			'screen'
		);

	}

	function selectIntersections(
		intersections: THREE.Intersection[],
		placedModel: THREE.Group,
		clientX: number,
		clientY: number,
		source: 'screen' | 'xr-select'
	): void {

		const visibleIntersections = intersections.filter(
			( intersection ) => (
				isLayerHidden( intersection.object, placedModel ) === false
				&& isNonSelectableHelper( intersection.object ) === false
			)
		);

		if ( visibleIntersections.length === 0 ) {
			if ( sceneBundle.renderer.xr.isPresenting ) {
				propertySelection.clearSelection();
				onSelectionCleared?.();
				setStatus( 'No model part hit. Center the model and tap again.' );
				return;
			}

			propertySelection.clearSelection();
			onSelectionCleared?.();
			setStatus( 'No model part selected.' );
			return;
		}

		const clickedMesh = visibleIntersections[ 0 ].object;
		const businessObject = propertySelection.resolveBusinessObject(
			clickedMesh,
			placedModel,
			getPipesByName()
		);
		const properties = getPropertiesForBusinessObject( businessObject, clickedMesh );
		applySelection( businessObject, properties, clickedMesh );

	}

	function applySelection(
		businessObject: THREE.Object3D,
		properties: PipeRecord | null,
		highlightObject?: THREE.Object3D
	): void {

		const businessName = getBusinessName( businessObject );
		propertySelection.selectBusinessObject( businessObject, properties, highlightObject );
		onSelectionApplied?.( { businessObject, properties, highlightObject } );
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

	function getPropertiesForBusinessObject(
		businessObject: THREE.Object3D,
		fallbackObject?: THREE.Object3D
	): PipeRecord | null {

		const businessName = getBusinessName( businessObject )
			|| getBusinessName( fallbackObject )
			|| 'UnnamedObject';
		return getPipesByName().get( businessName ) || null;

	}

	function isLayerHidden(object: THREE.Object3D, placedModel: THREE.Group): boolean {

		let current: THREE.Object3D | null = object;
		while ( current !== null ) {
			if ( current.userData.__layerHidden === true ) {
				return true;
			}

			if ( current === placedModel ) {
				return false;
			}

			current = current.parent;
		}

		return false;

	}

	function isNonSelectableHelper(object: THREE.Object3D): boolean {

		let current: THREE.Object3D | null = object;
		while ( current !== null ) {
			if ( current.userData.__nonSelectableHelper === true ) {
				return true;
			}

			current = current.parent;
		}

		return false;

	}

	function getBusinessName(object: THREE.Object3D | undefined): string | null {

		if ( object === undefined ) {
			return null;
		}

		const userDataBusinessName = object.userData.__businessName;
		if ( typeof userDataBusinessName === 'string' && userDataBusinessName.length > 0 ) {
			return userDataBusinessName;
		}

		if ( object.name.length > 0 ) {
			return object.name;
		}

		return null;

	}

}



