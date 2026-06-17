import * as THREE from 'three';
import { MODEL_URL } from '../load-model/config.js';
import { createStatusUpdater, getARDomElements, setupOverlayToggle } from './dom.js';
import { clearPlacedModel, loadModelTemplate, placeModelAt } from './model.js';
import { createARScene, resizeARScene } from './scene.js';
import { createXRHitTestController } from './xr.js';

const dom = getARDomElements();
const setStatus = createStatusUpdater( dom.statusEl );
const sceneBundle = createARScene( dom.canvasContainer );
const placementPosition = new THREE.Vector3();
const xrSelectController = sceneBundle.controller as THREE.Group & {
	addEventListener(type: 'select', listener: () => void): void;
};

let modelTemplate: THREE.Group | null = null;
let placedModel: THREE.Group | null = null;

dom.modelNameEl.textContent = MODEL_URL;

const xrHitTest = createXRHitTestController( {
	renderer: sceneBundle.renderer,
	reticle: sceneBundle.reticle,
	xrButtonWrap: dom.xrButtonWrap,
	setStatus,
	onSessionStart: () => {
		placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
	},
	onSessionEnd: () => {
		placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
	}
} );

bootstrap();

async function bootstrap(): Promise<void> {

	setupOverlayToggle( dom );
	setStatus( '正在初始化...' );
	xrSelectController.addEventListener( 'select', onSelect );
	sceneBundle.renderer.setAnimationLoop( render );
	xrHitTest.setup();

	dom.resetPlacementButton.addEventListener( 'click', () => {
		placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
		setStatus( sceneBundle.renderer.xr.isPresenting ? '已重置，请重新寻找地面并点击放置模型' : '已重置模型位置' );
	} );

	window.addEventListener( 'resize', onWindowResize );

	try {
		modelTemplate = await loadModelTemplate( MODEL_URL, setStatus );
	} catch {
		// Error state has already been reflected in the UI.
	}

}

function onSelect(): void {

	if ( modelTemplate === null ) {
		return;
	}

	const hitPosition = xrHitTest.getReticlePosition( placementPosition );
	if ( hitPosition === null ) {
		return;
	}

	placedModel = placeModelAt(
		modelTemplate,
		placedModel,
		sceneBundle.modelAnchor,
		hitPosition,
		sceneBundle.camera
	);

	setStatus( '模型已放置在现实地面上，再次点击可重新放置' );

}

function onWindowResize(): void {

	resizeARScene( sceneBundle.camera, sceneBundle.renderer );

}

function render(_: number, frame?: XRFrame): void {

	if ( sceneBundle.renderer.xr.isPresenting && frame ) {
		xrHitTest.update( frame );
	}

	sceneBundle.renderer.render( sceneBundle.scene, sceneBundle.camera );

}
