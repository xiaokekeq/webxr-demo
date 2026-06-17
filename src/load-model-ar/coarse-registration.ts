import * as THREE from 'three';
import { COARSE_REGISTRATION_TARGET, type CoarseRegistrationTarget } from './coarse-registration-config.js';
import type { CoarsePlacementEstimate, SetStatus } from './types.js';

interface CreateCoarseRegistrationControllerOptions {
	setStatus: SetStatus;
	target?: CoarseRegistrationTarget;
}

interface DeviceOrientationEventWithCompass extends DeviceOrientationEvent {
	webkitCompassHeading?: number;
}

const tempPosition = new THREE.Vector3();

export function createCoarseRegistrationController(
	options: CreateCoarseRegistrationControllerOptions
) {

	const { setStatus, target = COARSE_REGISTRATION_TARGET } = options;

	let lastHeadingDeg: number | null = null;
	let lastGeolocation: GeolocationPosition | null = null;
	let orientationListening = false;

	async function prime(): Promise<void> {

		startOrientationIfPossible();

		try {
			await refreshGeolocation();
		} catch {
			// Let the user trigger permission flow manually if auto prime is blocked.
		}

	}

	async function enable(): Promise<void> {

		await ensureOrientationAccess();
		await refreshGeolocation();
		setStatus( getReadyMessage() );

	}

	async function refreshGeolocation(): Promise<void> {

		if ( 'geolocation' in navigator === false ) {
			throw new Error( '当前浏览器不支持 Geolocation API' );
		}

		const position = await new Promise<GeolocationPosition>( ( resolve, reject ) => {
			navigator.geolocation.getCurrentPosition(
				resolve,
				reject,
				{
					enableHighAccuracy: true,
					timeout: 10000,
					maximumAge: 0
				}
			);
		} );

		lastGeolocation = position;

	}

	function canEstimate(): boolean {

		if ( lastHeadingDeg === null ) {
			return false;
		}

		if ( target.mode === 'absolute-site' ) {
			return lastGeolocation !== null;
		}

		return true;

	}

	function estimatePlacement(
		cameraWorldPosition: THREE.Vector3,
		groundY: number
	): CoarsePlacementEstimate | null {

		if ( canEstimate() === false || lastHeadingDeg === null ) {
			return null;
		}

		const offset = getTargetOffsetMeters();
		if ( offset === null ) {
			return null;
		}

		const headingRad = THREE.MathUtils.degToRad( lastHeadingDeg );
		const localX = offset.eastMeters * Math.cos( headingRad ) - offset.northMeters * Math.sin( headingRad );
		const forwardMeters = offset.eastMeters * Math.sin( headingRad ) + offset.northMeters * Math.cos( headingRad );
		const localZ = - forwardMeters;

		tempPosition.copy( cameraWorldPosition );
		tempPosition.x += localX;
		tempPosition.y = groundY;
		tempPosition.z += localZ;

		return {
			position: tempPosition.clone(),
			yawRad: THREE.MathUtils.degToRad(
				offset.targetHeadingDeg - lastHeadingDeg + ( offset.assetYawOffsetDeg ?? 0 )
			),
			distanceMeters: Math.hypot( offset.eastMeters, offset.northMeters ),
			headingDeg: lastHeadingDeg,
			accuracyMeters: lastGeolocation?.coords.accuracy ?? null,
			sourceLabel: offset.label
		};

	}

	function getReadyMessage(): string {

		if ( target.mode === 'absolute-site' && lastGeolocation !== null && lastHeadingDeg !== null ) {
			return `粗配准已准备：GPS 精度约 ${Math.round( lastGeolocation.coords.accuracy )}m，朝向 ${Math.round( lastHeadingDeg )}°`;
		}

		if ( lastHeadingDeg !== null ) {
			return `粗配准已准备：朝向 ${Math.round( lastHeadingDeg )}°，可自动生成初值`;
		}

		return '传感器已启用，等待有效朝向数据';

	}

	function getMissingRequirementMessage(): string {

		if ( lastHeadingDeg === null ) {
			return '粗配准缺少 IMU 朝向数据，请启用方向传感器';
		}

		if ( target.mode === 'absolute-site' && lastGeolocation === null ) {
			return '粗配准缺少 GPS 定位数据，请允许位置权限';
		}

		return '粗配准条件尚未满足';

	}

	function startOrientationIfPossible(): void {

		const OrientationEventCtor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
			requestPermission?: () => Promise<'granted' | 'denied'>;
		};

		if ( typeof OrientationEventCtor === 'undefined' ) {
			return;
		}

		if ( typeof OrientationEventCtor.requestPermission === 'function' ) {
			return;
		}

		attachOrientationListener();

	}

	async function ensureOrientationAccess(): Promise<void> {

		const OrientationEventCtor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
			requestPermission?: () => Promise<'granted' | 'denied'>;
		};

		if ( typeof OrientationEventCtor === 'undefined' ) {
			throw new Error( '当前浏览器不支持 DeviceOrientationEvent' );
		}

		if ( typeof OrientationEventCtor.requestPermission === 'function' ) {
			const permission = await OrientationEventCtor.requestPermission();
			if ( permission !== 'granted' ) {
				throw new Error( '方向传感器权限被拒绝' );
			}
		}

		attachOrientationListener();

	}

	function attachOrientationListener(): void {

		if ( orientationListening ) {
			return;
		}

		window.addEventListener( 'deviceorientation', handleDeviceOrientation, true );
		orientationListening = true;

	}

	function handleDeviceOrientation(event: DeviceOrientationEvent): void {

		const heading = extractHeading( event as DeviceOrientationEventWithCompass );
		if ( heading !== null ) {
			lastHeadingDeg = heading;
		}

	}

	function extractHeading(event: DeviceOrientationEventWithCompass): number | null {

		if ( typeof event.webkitCompassHeading === 'number' ) {
			return normalizeDegrees( event.webkitCompassHeading );
		}

		if ( typeof event.alpha === 'number' ) {
			return normalizeDegrees( 360 - event.alpha );
		}

		return null;

	}

	function getTargetOffsetMeters(): {
		eastMeters: number;
		northMeters: number;
		targetHeadingDeg: number;
		assetYawOffsetDeg?: number;
		label: string;
	} | null {

		if ( target.mode === 'demo-offset' ) {
			return target;
		}

		if ( lastGeolocation === null ) {
			return null;
		}

		const latitudeRad = THREE.MathUtils.degToRad( ( lastGeolocation.coords.latitude + target.latitude ) / 2 );
		const metersPerLat = 111320;
		const metersPerLon = 111320 * Math.cos( latitudeRad );

		const northMeters = ( target.latitude - lastGeolocation.coords.latitude ) * metersPerLat;
		const eastMeters = ( target.longitude - lastGeolocation.coords.longitude ) * metersPerLon;

		return {
			eastMeters,
			northMeters,
			targetHeadingDeg: target.targetHeadingDeg,
			assetYawOffsetDeg: target.assetYawOffsetDeg,
			label: target.label
		};

	}

	return {
		prime,
		enable,
		refreshGeolocation,
		canEstimate,
		estimatePlacement,
		getReadyMessage,
		getMissingRequirementMessage
	};

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}
