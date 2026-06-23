import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const previewForward = new THREE.Vector3();
const previewBounds = new THREE.Box3();
const previewSize = new THREE.Vector3();
const previewCenter = new THREE.Vector3();
const previewSphere = new THREE.Sphere();
const fitCameraPosition = new THREE.Vector3();
const fitModelBounds = new THREE.Box3();
const fitModelSphere = new THREE.Sphere();

export function getPreviewPlacementPosition(
	camera: THREE.Camera,
	cameraPosition: THREE.Vector3,
	groundY: number,
	distanceMeters: number
): THREE.Vector3 {

	camera.getWorldDirection( previewForward );
	previewForward.y = 0;

	if ( previewForward.lengthSq() < 1e-6 ) {
		previewForward.set( 0, 0, -1 );
	} else {
		previewForward.normalize();
	}

	return cameraPosition
		.clone()
		.addScaledVector( previewForward, distanceMeters )
		.setY( groundY );

}

export function getPlacementResidualScale(
	modelTemplateGroup: THREE.Group,
	registrationScale: number
): number {

	const bakedScaleFactor = typeof modelTemplateGroup.userData.__bakedScaleFactor === 'number'
		? modelTemplateGroup.userData.__bakedScaleFactor
		: 1;

	if ( Math.abs( bakedScaleFactor ) < 1e-9 ) {
		return registrationScale;
	}

	return registrationScale / bakedScaleFactor;

}

export function clampPlacementScaleToCameraView(options: {
	camera: THREE.Camera;
	modelTemplate: THREE.Group;
	position: THREE.Vector3;
	scale: number;
	maxScreenRatio: number;
	minDistanceMeters: number;
}): number {

	const {
		camera,
		modelTemplate,
		position,
		scale,
		maxScreenRatio,
		minDistanceMeters
	} = options;

	if (
		camera instanceof THREE.PerspectiveCamera === false
		|| Number.isFinite( scale ) === false
		|| scale <= 0
		|| maxScreenRatio <= 0
	) {
		return scale;
	}

	fitModelBounds.setFromObject( modelTemplate );
	if ( fitModelBounds.isEmpty() ) {
		return scale;
	}

	fitModelBounds.getBoundingSphere( fitModelSphere );
	const templateRadius = fitModelSphere.radius;
	if ( Number.isFinite( templateRadius ) === false || templateRadius <= 1e-6 ) {
		return scale;
	}

	camera.getWorldPosition( fitCameraPosition );
	const distanceMeters = Math.max(
		minDistanceMeters,
		fitCameraPosition.distanceTo( position )
	);
	const verticalHalfFov = THREE.MathUtils.degToRad( camera.fov * 0.5 );
	const horizontalHalfFov = Math.atan( Math.tan( verticalHalfFov ) * camera.aspect );
	const limitingHalfFov = Math.min( verticalHalfFov, horizontalHalfFov );
	const maxVisibleRadius = distanceMeters * Math.tan( limitingHalfFov ) * maxScreenRatio;
	const currentRadius = templateRadius * scale;

	if ( maxVisibleRadius <= 0 || currentRadius <= maxVisibleRadius ) {
		return scale;
	}

	return scale * ( maxVisibleRadius / currentRadius );

}

export function fitDesktopPreviewCamera(options: {
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	placedModel: THREE.Object3D | null;
	previewDirection: THREE.Vector3;
}): void {

	const { camera, controls, placedModel, previewDirection } = options;
	if ( placedModel === null ) {
		return;
	}

	previewBounds.setFromObject( placedModel );
	if ( previewBounds.isEmpty() ) {
		return;
	}

	previewBounds.getCenter( previewCenter );
	previewBounds.getSize( previewSize );
	previewBounds.getBoundingSphere( previewSphere );

	const verticalHalfFov = THREE.MathUtils.degToRad( camera.fov * 0.5 );
	const horizontalHalfFov = Math.atan( Math.tan( verticalHalfFov ) * camera.aspect );
	const limitingHalfFov = Math.min( verticalHalfFov, horizontalHalfFov );
	const radius = Math.max( previewSphere.radius, 0.25 );
	const fitDistance = ( radius / Math.sin( limitingHalfFov ) ) * 1.12;

	controls.target.copy( previewCenter );
	camera.position
		.copy( previewCenter )
		.addScaledVector( previewDirection.clone().normalize(), fitDistance );
	camera.near = Math.max( radius / 100, 0.01 );
	camera.far = Math.max( fitDistance * 12, 50 );
	camera.updateProjectionMatrix();

	controls.minDistance = Math.max( radius * 0.35, 0.25 );
	controls.maxDistance = Math.max( fitDistance * 4.5, 8 );
	controls.update();

}
