import * as THREE from 'three';
import type { TargetGuidanceState } from '../../../registration/registration-store.js';

const tempModelPosition = new THREE.Vector3();
const tempCameraPosition = new THREE.Vector3();
const tempCameraForward = new THREE.Vector3();
const tempHorizontalForward = new THREE.Vector3();
const tempHorizontalToTarget = new THREE.Vector3();
const tempProjected = new THREE.Vector3();

export function computeTargetGuidanceState(
	placedModel: THREE.Object3D | null,
	camera: THREE.Camera
): TargetGuidanceState {

	if ( placedModel === null ) {
		return createHiddenTargetGuidanceState();
	}

	placedModel.getWorldPosition( tempModelPosition );
	camera.getWorldPosition( tempCameraPosition );
	tempHorizontalToTarget.copy( tempModelPosition ).sub( tempCameraPosition );

	const distanceMeters = tempHorizontalToTarget.length();
	if ( Number.isFinite( distanceMeters ) === false || distanceMeters <= 1e-4 ) {
		return createHiddenTargetGuidanceState();
	}

	camera.getWorldDirection( tempCameraForward );
	tempHorizontalForward.copy( tempCameraForward ).setY( 0 );
	tempHorizontalToTarget.setY( 0 );

	if ( tempHorizontalForward.lengthSq() <= 1e-6 || tempHorizontalToTarget.lengthSq() <= 1e-6 ) {
		return createHiddenTargetGuidanceState();
	}

	tempHorizontalForward.normalize();
	tempHorizontalToTarget.normalize();

	const signedAngleDeg = getSignedHorizontalAngleDeg( tempHorizontalForward, tempHorizontalToTarget );
	const targetInFront = Math.abs( signedAngleDeg ) <= 90;

	tempProjected.copy( tempModelPosition ).project( camera );
	const centerVisible = targetInFront
		&& tempProjected.z >= -1
		&& tempProjected.z <= 1
		&& Math.abs( tempProjected.x ) <= 1
		&& Math.abs( tempProjected.y ) <= 1;

	if ( centerVisible ) {
		return createHiddenTargetGuidanceState();
	}

	const turnDirection = describeDirection( signedAngleDeg );
	const alignment = Math.abs( signedAngleDeg ) < 15
		? 'center'
		: signedAngleDeg > 0
			? 'right'
			: 'left';
	const roundedDistance = distanceMeters >= 10
		? `${Math.round( distanceMeters )}m`
		: `${distanceMeters.toFixed( 1 )}m`;
	const roundedTurnAngle = Math.max( 5, Math.round( Math.abs( signedAngleDeg ) / 5 ) * 5 );
	const detailText = Math.abs( signedAngleDeg ) < 15
		? `模型就在前方，距离约 ${roundedDistance}`
		: `向${signedAngleDeg > 0 ? '右' : '左'}转约 ${roundedTurnAngle}deg，距离约 ${roundedDistance}`;

	return {
		visible: true,
		directionText: turnDirection,
		distanceText: roundedDistance,
		detailText,
		alignment
	};

}

function createHiddenTargetGuidanceState(): TargetGuidanceState {

	return {
		visible: false,
		directionText: '',
		distanceText: '',
		detailText: '',
		alignment: 'center'
	};

}

function getSignedHorizontalAngleDeg(
	forward: THREE.Vector3,
	toTarget: THREE.Vector3
): number {

	const dot = THREE.MathUtils.clamp( forward.dot( toTarget ), -1, 1 );
	const determinant = forward.x * toTarget.z - forward.z * toTarget.x;
	return THREE.MathUtils.radToDeg( Math.atan2( determinant, dot ) );

}

function describeDirection(signedAngleDeg: number): string {

	const absAngle = Math.abs( signedAngleDeg );
	if ( absAngle < 15 ) {
		return '前方';
	}

	if ( absAngle < 60 ) {
		return signedAngleDeg > 0 ? '右前方' : '左前方';
	}

	if ( absAngle < 120 ) {
		return signedAngleDeg > 0 ? '右侧' : '左侧';
	}

	if ( absAngle < 165 ) {
		return signedAngleDeg > 0 ? '右后方' : '左后方';
	}

	return '身后';

}
