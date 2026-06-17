import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DISPLAY_MODES, MODEL_URL, PIPES_URL } from './config.js';
import { loadBusinessData } from './data.js';
import {
	getPropertyElements,
	isSupportedDisplayMode,
	positionPropertyPanel,
	resetPropertyPanel,
	showPropertyPanel,
	updateModeButtons,
	updatePropertyPanel
} from './dom.js';
import {
	cacheSourceMaterials,
	createHighlightedMaterial,
	disposeDynamicMaterials,
	replaceMeshMaterialsForMode
} from './materials.js';
import { createScene, fitCameraToObject, resizeScene } from './scene.js';
import type { DisplayMode, PipeRecord, PreviousSelection } from './types.js';

const modelNameEl = document.getElementById( 'model-name' ) as HTMLElement;
const statusEl = document.getElementById( 'status' ) as HTMLElement;
const canvasContainer = document.getElementById( 'canvas-container' ) as HTMLElement;
const closePropertyButton = document.getElementById( 'property-close' ) as HTMLButtonElement;
const modeButtons = document.querySelectorAll<HTMLButtonElement>( '[data-mode]' );
const propertyEls = getPropertyElements();

const selectionBox = new THREE.Box3();
const selectionCenter = new THREE.Vector3();
const selectionAnchor = new THREE.Vector3();
const projectedAnchor = new THREE.Vector3();
const pointer = new THREE.Vector2();
const pointerDownPosition = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

modelNameEl.textContent = MODEL_URL;

const { scene, camera, renderer, controls } = createScene( canvasContainer );

let modelRoot: THREE.Object3D | null = null;
let pipesByName = new Map<string, PipeRecord>();
let selectedMeshes: THREE.Mesh[] = [];
let selectedBusinessObject: THREE.Object3D | null = null;
let selectedBusinessName: string | null = null;
let selectedProperties: PipeRecord | null = null;
let currentDisplayMode: DisplayMode = DISPLAY_MODES.solid;

bootstrap();

async function bootstrap(): Promise<void> {

	resetPropertyPanel( propertyEls );
	window.addEventListener( 'resize', onWindowResize );
	renderer.domElement.addEventListener( 'pointerdown', onPointerDown );
	renderer.domElement.addEventListener( 'pointerup', onPointerUp );
	closePropertyButton.addEventListener( 'click', onClosePropertyPanel );

	modeButtons.forEach( ( button ) => {
		button.addEventListener( 'click', () => {
			if ( isSupportedDisplayMode( button.dataset.mode ) ) {
				setDisplayMode( button.dataset.mode );
			}
		} );
	} );

	renderer.setAnimationLoop( render );

	pipesByName = await loadBusinessData( PIPES_URL, statusEl );
	loadModel();

}

function loadModel(): void {

	statusEl.textContent = '正在加载模型...';

	const loader = new GLTFLoader();
	loader.load(
		MODEL_URL,
		( gltf ) => {
			modelRoot = gltf.scene;
			scene.add( modelRoot );
			cacheSourceMaterials( modelRoot );
			applyDisplayModeToModel();
			fitCameraToObject( modelRoot, camera, controls );
			statusEl.textContent = '模型加载成功，可点击查询属性';
		},
		( event ) => {
			if ( event.total > 0 ) {
				const progress = Math.round( event.loaded / event.total * 100 );
				statusEl.textContent = `正在加载模型... ${progress}%`;
			}
		},
		( error ) => {
			console.error( 'GLB load failed:', error );
			statusEl.textContent = '模型加载失败';
		}
	);

}

function setDisplayMode(mode: DisplayMode): void {

	currentDisplayMode = mode;
	updateModeButtons( modeButtons, currentDisplayMode );
	applyDisplayModeToModel();
	statusEl.textContent = getDisplayModeStatus( mode );

}

function applyDisplayModeToModel(): void {

	if ( modelRoot === null ) {
		return;
	}

	const previousSelection: PreviousSelection = {
		object: selectedBusinessObject,
		name: selectedBusinessName,
		properties: selectedProperties
	};

	if ( previousSelection.object ) {
		clearSelection( false );
	}

	modelRoot.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh ) {
			const businessObject = resolveBusinessObject( child );
			const businessName = businessObject.name || child.name || '';
			const pipeRecord = pipesByName.get( businessName ) || null;
			replaceMeshMaterialsForMode( child, currentDisplayMode, pipeRecord );
		}
	} );

	if ( previousSelection.object ) {
		selectedBusinessName = previousSelection.name;
		selectedProperties = previousSelection.properties;
		applyHighlight( previousSelection.object, true );
		updatePropertyPanelPlacement();
		showPropertyPanel( propertyEls );
	}

}

function onPointerDown(event: PointerEvent): void {

	pointerDownPosition.set( event.clientX, event.clientY );

}

function onPointerUp(event: PointerEvent): void {

	if ( modelRoot === null ) {
		return;
	}

	const dragDistance = pointerDownPosition.distanceTo( new THREE.Vector2( event.clientX, event.clientY ) );
	if ( dragDistance > 6 ) {
		return;
	}

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

	raycaster.setFromCamera( pointer, camera );
	const intersects = raycaster.intersectObjects( modelRoot.children, true );

	if ( intersects.length === 0 ) {
		clearSelection();
		statusEl.textContent = '未选中任何模型部件';
		return;
	}

	const clickedMesh = intersects[ 0 ].object;
	const businessObject = resolveBusinessObject( clickedMesh );
	const businessName = businessObject.name || clickedMesh.name || 'UnnamedObject';
	const properties = pipesByName.get( businessName ) || null;

	selectedBusinessName = businessName;
	selectedProperties = properties;
	applyHighlight( businessObject );
	updatePropertyPanel( propertyEls, businessName, properties );
	updatePropertyPanelPlacement();
	showPropertyPanel( propertyEls );
	statusEl.textContent = properties
		? `已选中 ${businessName}，属性已匹配`
		: `已选中 ${businessName}，但 pipes.json 中未找到同名数据`;

}

function resolveBusinessObject(mesh: THREE.Object3D): THREE.Object3D {

	let current: THREE.Object3D | null = mesh;
	let fallback = mesh;

	while ( current && current !== modelRoot ) {
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

function applyHighlight(businessObject: THREE.Object3D, preservePanel = false): void {

	clearSelection( ! preservePanel );
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

function clearSelection(resetPanel = true): void {

	for ( const mesh of selectedMeshes ) {
		if ( mesh.userData.__originalMaterial ) {
			disposeDynamicMaterials( mesh.material, mesh.userData.__originalMaterial );
			mesh.material = mesh.userData.__originalMaterial;
			delete mesh.userData.__originalMaterial;
		}
	}

	selectedMeshes = [];
	selectedBusinessObject = null;

	if ( resetPanel ) {
		selectedBusinessName = null;
		selectedProperties = null;
		resetPropertyPanel( propertyEls );
	}

}

function onClosePropertyPanel(): void {

	clearSelection();
	statusEl.textContent = '属性面板已关闭';

}

function onWindowResize(): void {

	resizeScene( canvasContainer, camera, renderer );
	updatePropertyPanelPlacement();

}

function render(): void {

	controls.update();
	updatePropertyPanelPlacement();
	renderer.render( scene, camera );

}

function updatePropertyPanelPlacement(): void {

	if ( selectedBusinessObject === null ) {
		return;
	}

	scene.updateMatrixWorld( true );
	camera.updateMatrixWorld();

	getSelectionAnchor( selectedBusinessObject, selectionAnchor );
	projectedAnchor.copy( selectionAnchor ).project( camera );

	const isInFrontOfCamera = projectedAnchor.z >= - 1 && projectedAnchor.z <= 1;
	if ( isInFrontOfCamera === false ) {
		propertyEls.panel.classList.add( 'hidden' );
		return;
	}

	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const screenX = ( projectedAnchor.x * 0.5 + 0.5 ) * viewportWidth;
	const screenY = ( - projectedAnchor.y * 0.5 + 0.5 ) * viewportHeight;

	positionPropertyPanel( propertyEls, screenX, screenY, viewportWidth, viewportHeight );

}

function getSelectionAnchor(object: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 {

	selectionBox.setFromObject( object );

	if ( selectionBox.isEmpty() ) {
		return object.getWorldPosition( target );
	}

	selectionBox.getCenter( selectionCenter );
	target.set( selectionCenter.x, selectionBox.max.y, selectionCenter.z );
	return target;

}

function getDisplayModeStatus(mode: DisplayMode): string {

	if ( mode === DISPLAY_MODES.transparent ) {
		return '已切换到透视模式';
	}

	if ( mode === DISPLAY_MODES.structure ) {
		return '已切换到结构模式';
	}

	return '已切换到普通模式';

}
