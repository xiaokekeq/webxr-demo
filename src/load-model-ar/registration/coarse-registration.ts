import * as THREE from 'three';
import { COARSE_REGISTRATION_TARGET, type CoarseRegistrationTarget } from './coarse-registration-config.js';
import { createEnuFrame, geodeticToEnu } from './geodesy.js';
import type { CoarsePlacementEstimate, SetStatus } from '../shared/types.js';

interface CreateCoarseRegistrationControllerOptions {
	setStatus: SetStatus;
	target?: CoarseRegistrationTarget;
}

interface DeviceOrientationEventWithCompass extends DeviceOrientationEvent {
	webkitCompassHeading?: number;
}

interface CoarseRegistrationDebugSnapshot {
	currentGeodetic: {
		lat: number;
		lon: number;
		alt: number;
	} | null;
	targetGeodetic: {
		lat: number;
		lon: number;
		alt: number;
	} | null;
	accuracyMeters: number | null;
	distanceMeters: number | null;
	headingDeg: number | null;
}

const tempPosition = new THREE.Vector3();
const tempEnuOffset = new THREE.Vector3();
const tempArOffset = new THREE.Vector3();
const tempRotationMatrix = new THREE.Matrix4();
const tempScale = new THREE.Vector3( 1, 1, 1 );
const tempQuaternion = new THREE.Quaternion();
const MAX_REUSED_GEOLOCATION_AGE_MS = 15000;

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
		if ( hasFreshGeolocation() === false ) {
			await refreshGeolocation();
		}
		setStatus( getReadyMessage() );

	}

	async function refreshGeolocation(): Promise<void> {

		if ( 'geolocation' in navigator === false ) {
			throw new Error( 'Current browser does not support Geolocation API.' );
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

	function hasFreshGeolocation(): boolean {

		return lastGeolocation !== null
			&& Number.isFinite( lastGeolocation.timestamp )
			&& Date.now() - lastGeolocation.timestamp <= MAX_REUSED_GEOLOCATION_AGE_MS;

	}

	function estimatePlacement(
		cameraWorldPosition: THREE.Vector3,
		groundY: number
	): CoarsePlacementEstimate | null {

		// Coarse placement needs two runtime signals:
		// 1. device heading, used to align the ENU frame with the AR world;
		// 2. target offset, either demo ENU offset or GPS-derived target offset.
		if ( canEstimate() === false || lastHeadingDeg === null ) {
			return null;
		}

		const enuOffset = getTargetOffsetEnu();
		if ( enuOffset === null ) {
			return null;
		}

		const enuToArQuaternion = getEnuToArQuaternion( lastHeadingDeg, tempQuaternion );
		convertEnuOffsetToArOffset( enuOffset, lastHeadingDeg, tempArOffset );

		// Use the current camera pose as the local AR reference. The horizontal ENU
		// offset is rotated into AR space, while the vertical component is anchored
		// to the hit-test ground height.
		tempPosition.copy( cameraWorldPosition );
		tempPosition.x += tempArOffset.x;
		tempPosition.y = groundY + tempArOffset.y;
		tempPosition.z += tempArOffset.z;

		return {
			position: tempPosition.clone(),
			orientation: enuToArQuaternion.clone(),
			distanceMeters: enuOffset.length(),
			headingDeg: lastHeadingDeg,
			accuracyMeters: lastGeolocation?.coords.accuracy ?? null,
			sourceLabel: target.label
		};

	}

	function getReadyMessage(): string {

		if ( lastHeadingDeg === null ) {
			return 'Sensors enabled. Waiting for a valid heading sample.';
		}

		const parts = [ `heading ${Math.round( lastHeadingDeg )}deg` ];

		if ( target.mode === 'absolute-site' && lastGeolocation !== null ) {
			parts.unshift( `GPS accuracy about ${Math.round( lastGeolocation.coords.accuracy )}m` );
		}

		if ( target.mode !== 'absolute-site' ) {
			parts.push( 'ready to generate a coarse initial pose' );
		}

		return `Coarse registration ready: ${parts.join( ', ' )}`;

	}

	function getMissingRequirementMessage(): string {

		if ( lastHeadingDeg === null ) {
			return 'Coarse registration is missing IMU heading data.';
		}

		if ( target.mode === 'absolute-site' && lastGeolocation === null ) {
			return 'Coarse registration is missing GPS data.';
		}

		return 'Coarse registration requirements are not satisfied yet.';

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
			throw new Error( 'Current browser does not support DeviceOrientationEvent.' );
		}

		if ( typeof OrientationEventCtor.requestPermission === 'function' ) {
			const permission = await OrientationEventCtor.requestPermission();
			if ( permission !== 'granted' ) {
				throw new Error( 'Device orientation permission was denied.' );
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

	function getTargetOffsetEnu(): THREE.Vector3 | null {

		if ( target.mode === 'demo-offset' ) {
			// Demo mode bypasses GPS and uses a fixed local ENU offset.
			return tempEnuOffset.set( target.eastMeters, target.northMeters, 0 );
		}

		if ( lastGeolocation === null ) {
			return null;
		}

		const currentGeodetic = {
			lat: lastGeolocation.coords.latitude,
			lon: lastGeolocation.coords.longitude,
			alt: lastGeolocation.coords.altitude ?? 0
		};
		const targetGeodetic = {
			lat: target.latitude,
			lon: target.longitude,
			alt: target.altitude ?? currentGeodetic.alt
		};
		const currentEnuFrame = createEnuFrame( currentGeodetic );

		// Absolute-site mode converts the model/site origin into a local ENU offset
		// relative to the user's current GPS position.
		return geodeticToEnu( targetGeodetic, currentEnuFrame, tempEnuOffset );

	}

	function getDebugSnapshot(): CoarseRegistrationDebugSnapshot {

		const distanceMeters = getTargetOffsetEnu()?.length() ?? null;

		return {
			currentGeodetic: lastGeolocation === null
				? null
				: {
					lat: lastGeolocation.coords.latitude,
					lon: lastGeolocation.coords.longitude,
					alt: lastGeolocation.coords.altitude ?? 0
				},
			targetGeodetic: target.mode === 'absolute-site'
				? {
					lat: target.latitude,
					lon: target.longitude,
					alt: target.altitude ?? 0
				}
				: null,
			accuracyMeters: lastGeolocation?.coords.accuracy ?? null,
			distanceMeters,
			headingDeg: lastHeadingDeg
		};

	}

	return {
		prime,
		enable,
		refreshGeolocation,
		canEstimate,
		estimatePlacement,
		getDebugSnapshot,
		getReadyMessage,
		getMissingRequirementMessage
	};

}

export function getEnuToArQuaternion(
	headingDeg: number,
	target = new THREE.Quaternion()
): THREE.Quaternion {

	// ENU uses X=east, Y=north, Z=up. Three.js AR world uses Y=up and
	// camera-forward roughly along -Z, so this matrix maps ENU basis vectors
	// into the current AR world using the device compass heading.
	const headingRad = THREE.MathUtils.degToRad( headingDeg );
	const cosHeading = Math.cos( headingRad );
	const sinHeading = Math.sin( headingRad );

	tempRotationMatrix.set(
		cosHeading, 0, sinHeading, 0,
		0, 0, -1, 0,
		-sinHeading, 0, cosHeading, 0,
		0, 0, 0, 1
	);

	return target.setFromRotationMatrix( tempRotationMatrix );

}

function convertEnuOffsetToArOffset(
	enuOffset: THREE.Vector3,
	headingDeg: number,
	target = new THREE.Vector3()
): THREE.Vector3 {

	// Rotate the horizontal ENU offset into AR horizontal axes. ENU altitude maps
	// to AR Y; north/east are projected onto AR X/Z according to heading.
	const headingRad = THREE.MathUtils.degToRad( headingDeg );
	const cosHeading = Math.cos( headingRad );
	const sinHeading = Math.sin( headingRad );

	target.set(
		enuOffset.x * cosHeading - enuOffset.y * sinHeading,
		enuOffset.z,
		- ( enuOffset.x * sinHeading + enuOffset.y * cosHeading )
	);

	return target;

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}

