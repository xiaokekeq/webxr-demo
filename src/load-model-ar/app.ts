import * as THREE from 'three';
import { MODEL_CONFIG_URL, MODEL_URL, PIPES_URL } from '../load-model/config.js';
import { createHighlightedMaterial, disposeDynamicMaterials } from '../load-model/materials.js';
import type { PipeRecord } from '../load-model/types.js';
import {
	createCoarseTargetFromModelConfig,
	loadDemoModelConfig,
	type DemoModelConfig
} from './demo-model-config.js';
import { createStatusUpdater, getARDomElements, setupOverlayToggle } from './dom.js';
import { createCoarseRegistrationController } from './coarse-registration.js';
import { clearPlacedModel, loadModelTemplate, placeModelAt } from './model.js';
import { createARScene, resizeARScene } from './scene.js';
import { createXRHitTestController } from './xr.js';

const dom = getARDomElements();
const setStatus = createStatusUpdater( dom.statusEl );
const sceneBundle = createARScene( dom.canvasContainer );
const coarseGroundPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const previewForward = new THREE.Vector3();
const previewPosition = new THREE.Vector3();
const pointer = new THREE.Vector2();
const pointerDownPosition = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const propertyPanel = document.getElementById( 'ar-property-panel' ) as HTMLElement;
const propertyCloseButton = document.getElementById( 'ar-property-close' ) as HTMLButtonElement;
const propertyNameEl = document.getElementById( 'ar-prop-name' ) as HTMLElement;
const propertyTypeEl = document.getElementById( 'ar-prop-type' ) as HTMLElement;
const propertyDiameterEl = document.getElementById( 'ar-prop-diameter' ) as HTMLElement;
const propertyMaterialEl = document.getElementById( 'ar-prop-material' ) as HTMLElement;
const propertyDepthEl = document.getElementById( 'ar-prop-depth' ) as HTMLElement;
const propertyStatusEl = document.getElementById( 'ar-prop-status' ) as HTMLElement;
const propertyRemarkEl = document.getElementById( 'ar-prop-remark' ) as HTMLElement;

const MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS = 8;
const MAX_RELIABLE_GPS_ACCURACY_METERS = 15;
const PREVIEW_PLACEMENT_DISTANCE_METERS = 2.5;

let modelTemplate: THREE.Group | null = null;
let demoModelConfig: DemoModelConfig | null = null;
let placedModel: THREE.Group | null = null;
let coarsePlacementPending = false;
let coarseRegistration = createCoarseRegistrationController( { setStatus } );
let pipesByName = new Map<string, PipeRecord>();
let selectedBusinessObject: THREE.Object3D | null = null;
let selectedMeshes: THREE.Mesh[] = [];

dom.modelNameEl.textContent = MODEL_URL;
resetPropertyPanel();

const xrHitTest = createXRHitTestController( {
	renderer: sceneBundle.renderer,
	reticle: sceneBundle.reticle,
	xrButtonWrap: dom.xrButtonWrap,
	setStatus,
	onSessionStart: () => {
		resetPlacement();
		if ( coarseRegistration.canEstimate() ) {
			coarsePlacementPending = true;
		}
	},
	onSessionEnd: () => {
		resetPlacement();
	},
	canReportStatus: () => placedModel === null && coarsePlacementPending === false
} );

bootstrap();

async function bootstrap(): Promise<void> {

	setupOverlayToggle( dom );
	setStatus( 'Initializing AR placement...' );
	sceneBundle.renderer.setAnimationLoop( render );
	xrHitTest.setup();

	sceneBundle.renderer.domElement.addEventListener( 'pointerdown', onPointerDown );
	sceneBundle.renderer.domElement.addEventListener( 'pointerup', onPointerUp );
	propertyCloseButton.addEventListener( 'click', () => {
		clearSelection();
		setStatus( 'Property panel closed.' );
	} );

	dom.resetPlacementButton.addEventListener( 'click', () => {
		resetPlacement();
		if ( sceneBundle.renderer.xr.isPresenting ) {
			requestAutoPlacement();
			setStatus( 'Model reset. Waiting for a stable plane to auto-place again.' );
			return;
		}

		setStatus( 'Model placement reset.' );
	} );

	dom.enableCoarseButton.addEventListener( 'click', async () => {
		try {
			await coarseRegistration.enable();
			requestAutoPlacement();
		} catch ( error ) {
			console.error( 'Coarse registration enable failed:', error );
			const message = error instanceof Error ? error.message : 'Failed to enable coarse registration.';
			setStatus( message );
		}
	} );

	dom.refreshGeoButton.addEventListener( 'click', async () => {
		try {
			await coarseRegistration.refreshGeolocation();
			setStatus( coarseRegistration.getReadyMessage() );
			requestAutoPlacement();
		} catch ( error ) {
			console.error( 'Geolocation refresh failed:', error );
			const message = error instanceof Error ? error.message : 'Failed to refresh geolocation.';
			setStatus( message );
		}
	} );

	window.addEventListener( 'resize', onWindowResize );

	try {
		pipesByName = await loadPipeRecords();
		demoModelConfig = await loadDemoModelConfig( MODEL_CONFIG_URL, setStatus );
		coarseRegistration = createCoarseRegistrationController( {
			setStatus,
			target: createCoarseTargetFromModelConfig( demoModelConfig )
		} );

		modelTemplate = await loadModelTemplate( MODEL_URL, setStatus, demoModelConfig.scale );
		void coarseRegistration.prime()
			.then( () => {
				if ( sceneBundle.renderer.xr.isPresenting ) {
					requestAutoPlacement();
				}
			} )
			.catch( () => {
				// Permission flow can still be completed later from the overlay controls.
			} );
	} catch ( error ) {
		console.error( 'AR bootstrap failed:', error );
		const message = error instanceof Error ? error.message : 'Failed to initialize AR.';
		setStatus( message );
	}

}

function resetPlacement(): void {

	placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
	coarsePlacementPending = false;
	clearSelection();

}

function requestAutoPlacement(): void {

	if ( modelTemplate === null || sceneBundle.renderer.xr.isPresenting === false ) {
		return;
	}

	coarsePlacementPending = true;
	attemptCoarsePlacement();

}

function onPointerDown(event: PointerEvent): void {

	pointerDownPosition.set( event.clientX, event.clientY );

}

function onPointerUp(event: PointerEvent): void {

	if ( placedModel === null ) {
		return;
	}

	const dragDistance = pointerDownPosition.distanceTo( new THREE.Vector2( event.clientX, event.clientY ) );
	if ( dragDistance > 10 ) {
		return;
	}

	const rect = sceneBundle.renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

	raycaster.setFromCamera( pointer, sceneBundle.camera );
	const intersects = raycaster.intersectObjects( placedModel.children, true );

	if ( intersects.length === 0 ) {
		clearSelection();
		setStatus( 'No model part selected.' );
		return;
	}

	const clickedMesh = intersects[ 0 ].object;
	const businessObject = resolveBusinessObject( clickedMesh );
	const businessName = businessObject.name || clickedMesh.name || 'UnnamedObject';
	const properties = pipesByName.get( businessName ) || null;

	applyHighlight( businessObject );
	updatePropertyPanel( businessName, properties );
	setStatus(
		properties
			? `Selected ${businessName}.`
			: `Selected ${businessName}, but no matching pipes.json record was found.`
	);

}

function resolveBusinessObject(mesh: THREE.Object3D): THREE.Object3D {

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

}

function applyHighlight(businessObject: THREE.Object3D): void {

	clearSelection();
	selectedBusinessObject = businessObject;

	businessObject.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh ) {
			selectedMeshes.push( child );
			child.userData.__originalMaterial = child.material;

			const materials = Array.isArray( child.material ) ? child.material : [ child.material ];
			const highlightedMaterials = materials.map( createHighlightedMaterial );
			child.material = Array.isArray( child.material ) ? highlightedMaterials : highlightedMaterials[ 0 ];
		}
	} );

}

function clearSelection(): void {

	for ( const mesh of selectedMeshes ) {
		if ( mesh.userData.__originalMaterial ) {
			disposeDynamicMaterials( mesh.material, mesh.userData.__originalMaterial );
			mesh.material = mesh.userData.__originalMaterial;
			delete mesh.userData.__originalMaterial;
		}
	}

	selectedMeshes = [];
	selectedBusinessObject = null;
	resetPropertyPanel();

}

function updatePropertyPanel(businessName: string, properties: PipeRecord | null): void {

	propertyNameEl.textContent = businessName;
	propertyTypeEl.textContent = properties?.type || '-';
	propertyDiameterEl.textContent = properties?.diameter || '-';
	propertyMaterialEl.textContent = properties?.material || '-';
	propertyDepthEl.textContent = properties?.depth || '-';
	propertyStatusEl.textContent = properties?.status || '-';
	propertyRemarkEl.textContent = properties?.remark || 'No matching business record in pipes.json';
	propertyPanel.classList.remove( 'hidden' );

}

function resetPropertyPanel(): void {

	propertyNameEl.textContent = 'No selection';
	propertyTypeEl.textContent = '-';
	propertyDiameterEl.textContent = '-';
	propertyMaterialEl.textContent = '-';
	propertyDepthEl.textContent = '-';
	propertyStatusEl.textContent = '-';
	propertyRemarkEl.textContent = 'Tap a model part to inspect its properties.';
	propertyPanel.classList.add( 'hidden' );

}

function onWindowResize(): void {

	resizeARScene( sceneBundle.camera, sceneBundle.renderer );

}

function render(_: number, frame?: XRFrame): void {

	if ( sceneBundle.renderer.xr.isPresenting && frame ) {
		xrHitTest.update( frame );
		attemptCoarsePlacement();
	}

	sceneBundle.renderer.render( sceneBundle.scene, sceneBundle.camera );

}

function attemptCoarsePlacement(): void {

	if (
		coarsePlacementPending === false
		|| modelTemplate === null
		|| coarseRegistration.canEstimate() === false
		|| xrHitTest.hasGroundHit() === false
	) {
		return;
	}

	const groundPosition = xrHitTest.getHitPosition( coarseGroundPosition );
	if ( groundPosition === null ) {
		return;
	}

	sceneBundle.camera.getWorldPosition( cameraWorldPosition );

	const estimate = coarseRegistration.estimatePlacement( cameraWorldPosition, groundPosition.y );
	if ( estimate === null ) {
		setStatus( coarseRegistration.getMissingRequirementMessage() );
		return;
	}

	const shouldUsePreviewPlacement = (
		estimate.distanceMeters > MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS
		|| (
			estimate.accuracyMeters !== null
			&& estimate.accuracyMeters > MAX_RELIABLE_GPS_ACCURACY_METERS
		)
	);

	const targetPosition = shouldUsePreviewPlacement
		? getPreviewPlacementPosition( sceneBundle.camera, cameraWorldPosition, groundPosition.y )
		: estimate.position;

	placedModel = placeModelAt(
		modelTemplate,
		placedModel,
		sceneBundle.modelAnchor,
		targetPosition,
		estimate.yawRad
	);

	coarsePlacementPending = false;

	const accuracyText = estimate.accuracyMeters === null
		? 'no GPS accuracy info'
		: `GPS accuracy about ${Math.round( estimate.accuracyMeters )}m`;

	if ( shouldUsePreviewPlacement ) {
		setStatus(
			`Target is about ${Math.round( estimate.distanceMeters )}m away and ${accuracyText}. Switched to nearby preview mode so the model stays visible.`
		);
		return;
	}

	setStatus(
		`Coarse placement ready: ${estimate.sourceLabel}, distance about ${Math.round( estimate.distanceMeters )}m, heading ${Math.round( estimate.headingDeg )}deg, ${accuracyText}`
	);

}

function getPreviewPlacementPosition(
	camera: THREE.Camera,
	cameraPosition: THREE.Vector3,
	groundY: number
): THREE.Vector3 {

	camera.getWorldDirection( previewForward );
	previewForward.y = 0;

	if ( previewForward.lengthSq() < 1e-6 ) {
		previewForward.set( 0, 0, -1 );
	} else {
		previewForward.normalize();
	}

	previewPosition.copy( cameraPosition );
	previewPosition.addScaledVector( previewForward, PREVIEW_PLACEMENT_DISTANCE_METERS );
	previewPosition.y = groundY;

	return previewPosition;

}

async function loadPipeRecords(): Promise<Map<string, PipeRecord>> {

	const response = await fetch( PIPES_URL );
	if ( response.ok === false ) {
		throw new Error( `Failed to load pipes.json: HTTP ${response.status}` );
	}

	const data = await response.json();
	const pipes = Array.isArray( data ) ? data : data.pipes;
	if ( Array.isArray( pipes ) === false ) {
		throw new Error( 'pipes.json must be an array or an object with a pipes array.' );
	}

	return new Map( pipes.map( ( item: PipeRecord ) => [ item.name, item ] ) );

}
