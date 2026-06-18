import * as THREE from 'three';
import { MODEL_CONFIG_URL, MODEL_URL } from '../load-model/config.js';
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

let modelTemplate: THREE.Group | null = null;
let demoModelConfig: DemoModelConfig | null = null;
let placedModel: THREE.Group | null = null;
let coarsePlacementPending = false;
let coarseRegistration = createCoarseRegistrationController( { setStatus } );

dom.modelNameEl.textContent = MODEL_URL;

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
	setStatus( '正在初始化 AR 管线...' );
	sceneBundle.renderer.setAnimationLoop( render );
	xrHitTest.setup();

	dom.resetPlacementButton.addEventListener( 'click', () => {
		resetPlacement();
		if ( sceneBundle.renderer.xr.isPresenting ) {
			requestAutoPlacement();
			setStatus( '已重置模型，等待重新识别地面后自动放置' );
			return;
		}

		setStatus( '已重置模型位置' );
	} );

	dom.enableCoarseButton.addEventListener( 'click', async () => {
		try {
			await coarseRegistration.enable();
			requestAutoPlacement();
		} catch ( error ) {
			console.error( 'Coarse registration enable failed:', error );
			const message = error instanceof Error ? error.message : '启用粗配准失败';
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
			const message = error instanceof Error ? error.message : '刷新定位失败';
			setStatus( message );
		}
	} );

	window.addEventListener( 'resize', onWindowResize );

	try {
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
		const message = error instanceof Error ? error.message : 'AR 初始化失败';
		setStatus( message );
	}

}

function resetPlacement(): void {

	placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
	coarsePlacementPending = false;

}

function requestAutoPlacement(): void {

	if ( modelTemplate === null || sceneBundle.renderer.xr.isPresenting === false ) {
		return;
	}

	coarsePlacementPending = true;
	attemptCoarsePlacement();

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
