import * as THREE from 'three';
import { MODEL_URL } from '../load-model/config.js';
import { createStatusUpdater, getARDomElements, setupOverlayToggle } from './dom.js';
import { createCoarseRegistrationController } from './coarse-registration.js';
import { clearPlacedModel, loadModelTemplate, placeModelAt } from './model.js';
import { createARScene, resizeARScene } from './scene.js';
import { createXRHitTestController } from './xr.js';

const dom = getARDomElements();
const setStatus = createStatusUpdater( dom.statusEl );
const sceneBundle = createARScene( dom.canvasContainer );
const placementPosition = new THREE.Vector3();
const coarseGroundPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const xrSelectController = sceneBundle.controller as THREE.Group & {
	addEventListener(type: 'select', listener: () => void): void;
};

let modelTemplate: THREE.Group | null = null;
let placedModel: THREE.Group | null = null;
let coarsePlacementPending = false;

dom.modelNameEl.textContent = MODEL_URL;

const coarseRegistration = createCoarseRegistrationController( { setStatus } );

const xrHitTest = createXRHitTestController( {
	renderer: sceneBundle.renderer,
	reticle: sceneBundle.reticle,
	xrButtonWrap: dom.xrButtonWrap,
	setStatus,
	onSessionStart: () => {
		placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
		if ( coarseRegistration.canEstimate() ) {
			coarsePlacementPending = true;
		}
	},
	onSessionEnd: () => {
		placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
		coarsePlacementPending = false;
	},
	canReportStatus: () => placedModel === null && coarsePlacementPending === false
} );

bootstrap();

async function bootstrap(): Promise<void> {

	setupOverlayToggle( dom );
	setStatus( '正在初始化...' );
	xrSelectController.addEventListener( 'select', onSelect );
	sceneBundle.renderer.setAnimationLoop( render );
	xrHitTest.setup();

	void coarseRegistration.prime();

	dom.resetPlacementButton.addEventListener( 'click', () => {
		placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
		coarsePlacementPending = coarseRegistration.canEstimate();
		setStatus( sceneBundle.renderer.xr.isPresenting ? '已重置，请重新寻找地面并点击放置模型' : '已重置模型位置' );
	} );

	dom.enableCoarseButton.addEventListener( 'click', async () => {
		try {
			await coarseRegistration.enable();
			coarsePlacementPending = true;
			attemptCoarsePlacement();
		} catch ( error ) {
			console.error( 'Coarse registration enable failed:', error );
			const message = error instanceof Error ? error.message : '粗配准启用失败';
			setStatus( message );
		}
	} );

	dom.refreshGeoButton.addEventListener( 'click', async () => {
		try {
			await coarseRegistration.refreshGeolocation();
			coarsePlacementPending = true;
			setStatus( coarseRegistration.getReadyMessage() );
			attemptCoarsePlacement();
		} catch ( error ) {
			console.error( 'Geolocation refresh failed:', error );
			const message = error instanceof Error ? error.message : '定位刷新失败';
			setStatus( message );
		}
	} );

	window.addEventListener( 'resize', onWindowResize );

	try {
		modelTemplate = await loadModelTemplate( MODEL_URL, setStatus );
		coarsePlacementPending = coarseRegistration.canEstimate();
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
	coarsePlacementPending = false;

	setStatus( '模型已放置在现实地面上，再次点击可重新放置' );

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
	) {
		return;
	}

	const groundPosition = xrHitTest.getReticlePosition( coarseGroundPosition );
	if ( groundPosition === null ) {
		return;
	}

	sceneBundle.camera.getWorldPosition( cameraWorldPosition );

	const estimate = coarseRegistration.estimatePlacement( cameraWorldPosition, groundPosition.y );
	if ( estimate === null ) {
		setStatus( coarseRegistration.getMissingRequirementMessage() );
		return;
	}

	placedModel = placeModelAt(
		modelTemplate,
		placedModel,
		sceneBundle.modelAnchor,
		estimate.position,
		sceneBundle.camera,
		estimate.yawRad
	);

	coarsePlacementPending = false;

	const accuracyText = estimate.accuracyMeters === null
		? '无 GPS 精度信息'
		: `GPS 精度约 ${Math.round( estimate.accuracyMeters )}m`;

	setStatus(
		`粗配准完成：${estimate.sourceLabel}，距离约 ${Math.round( estimate.distanceMeters )}m，朝向 ${Math.round( estimate.headingDeg )}°，${accuracyText}`
	);

}
