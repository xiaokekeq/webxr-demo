import * as THREE from 'three';

export interface GeodeticCoordinate {
	lat: number;
	lon: number;
	alt: number;
}

export interface EnuFrame {
	kind: 'enu-frame';
	originGeodetic: GeodeticCoordinate;
	originEcef: THREE.Vector3;
	east: THREE.Vector3;
	north: THREE.Vector3;
	up: THREE.Vector3;
	ecefToEnuMatrix: THREE.Matrix3;
	enuToEcefMatrix: THREE.Matrix3;
}

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * ( 1 - WGS84_F );
const WGS84_E2 = 1 - ( WGS84_B * WGS84_B ) / ( WGS84_A * WGS84_A );
const WGS84_EP2 = ( WGS84_A * WGS84_A - WGS84_B * WGS84_B ) / ( WGS84_B * WGS84_B );

type EnuFrameLike = EnuFrame | GeodeticCoordinate;

const tempPointEcef = new THREE.Vector3();
const tempEcefDelta = new THREE.Vector3();
const tempRecoveredEcef = new THREE.Vector3();

export function createEnuFrame(origin: GeodeticCoordinate): EnuFrame {

	// ENU is a local tangent frame at the project/GPS origin:
	// X=east, Y=north, Z=up. It keeps nearby site coordinates in meters.
	const latRad = THREE.MathUtils.degToRad( origin.lat );
	const lonRad = THREE.MathUtils.degToRad( origin.lon );
	const sinLat = Math.sin( latRad );
	const cosLat = Math.cos( latRad );
	const sinLon = Math.sin( lonRad );
	const cosLon = Math.cos( lonRad );

	const east = new THREE.Vector3( - sinLon, cosLon, 0 );
	const north = new THREE.Vector3( - sinLat * cosLon, - sinLat * sinLon, cosLat );
	const up = new THREE.Vector3( cosLat * cosLon, cosLat * sinLon, sinLat );

	const ecefToEnuMatrix = new THREE.Matrix3().set(
		east.x, east.y, east.z,
		north.x, north.y, north.z,
		up.x, up.y, up.z
	);

	return {
		kind: 'enu-frame',
		originGeodetic: { ...origin },
		originEcef: geodeticToEcef( origin ),
		east,
		north,
		up,
		ecefToEnuMatrix,
		enuToEcefMatrix: ecefToEnuMatrix.clone().transpose()
	};

}

export function geodeticToEcef(geodetic: GeodeticCoordinate, target = new THREE.Vector3()): THREE.Vector3 {

	// Convert WGS84 latitude/longitude/altitude to Earth-Centered Earth-Fixed
	// coordinates. ECEF is the bridge used before projecting into ENU.
	const latRad = THREE.MathUtils.degToRad( geodetic.lat );
	const lonRad = THREE.MathUtils.degToRad( geodetic.lon );
	const sinLat = Math.sin( latRad );
	const cosLat = Math.cos( latRad );
	const sinLon = Math.sin( lonRad );
	const cosLon = Math.cos( lonRad );
	const radius = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sinLat * sinLat );

	target.set(
		( radius + geodetic.alt ) * cosLat * cosLon,
		( radius + geodetic.alt ) * cosLat * sinLon,
		( radius * ( 1 - WGS84_E2 ) + geodetic.alt ) * sinLat
	);

	return target;

}

export function ecefToGeodetic(ecef: THREE.Vector3): GeodeticCoordinate {

	const x = ecef.x;
	const y = ecef.y;
	const z = ecef.z;
	const p = Math.hypot( x, y );
	const theta = Math.atan2( z * WGS84_A, p * WGS84_B );
	const sinTheta = Math.sin( theta );
	const cosTheta = Math.cos( theta );
	const lonRad = Math.atan2( y, x );
	const latRad = Math.atan2(
		z + WGS84_EP2 * WGS84_B * sinTheta * sinTheta * sinTheta,
		p - WGS84_E2 * WGS84_A * cosTheta * cosTheta * cosTheta
	);
	const sinLat = Math.sin( latRad );
	const radius = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sinLat * sinLat );
	const alt = p / Math.cos( latRad ) - radius;

	return {
		lat: THREE.MathUtils.radToDeg( latRad ),
		lon: THREE.MathUtils.radToDeg( lonRad ),
		alt
	};

}

export function geodeticToEnu(
	point: GeodeticCoordinate,
	frameOrOrigin: EnuFrameLike,
	target = new THREE.Vector3()
): THREE.Vector3 {

	// Geodetic -> ECEF -> ENU gives a local meter offset from the ENU origin.
	const pointEcef = geodeticToEcef( point, tempPointEcef );
	return ecefToEnu( pointEcef, frameOrOrigin, target );

}

export function ecefToEnu(
	pointEcef: THREE.Vector3,
	frameOrOrigin: EnuFrameLike,
	target = new THREE.Vector3()
): THREE.Vector3 {

	const frame = resolveEnuFrame( frameOrOrigin );

	return target
		.copy( pointEcef )
		.sub( frame.originEcef )
		.applyMatrix3( frame.ecefToEnuMatrix );

}

export function enuToEcef(
	enu: THREE.Vector3,
	frameOrOrigin: EnuFrameLike,
	target = new THREE.Vector3()
): THREE.Vector3 {

	const frame = resolveEnuFrame( frameOrOrigin );

	return target
		.copy( enu )
		.applyMatrix3( frame.enuToEcefMatrix )
		.add( frame.originEcef );

}

export function enuToGeodetic(
	enu: THREE.Vector3,
	frameOrOrigin: EnuFrameLike
): GeodeticCoordinate {

	const ecef = enuToEcef( enu, frameOrOrigin, tempRecoveredEcef );
	return ecefToGeodetic( ecef );

}

export function getEnuBasis(frameOrOrigin: EnuFrameLike): {
	east: THREE.Vector3;
	north: THREE.Vector3;
	up: THREE.Vector3;
} {

	const frame = resolveEnuFrame( frameOrOrigin );

	return {
		east: frame.east.clone(),
		north: frame.north.clone(),
		up: frame.up.clone()
	};

}

export function ecefDeltaToEnu(
	ecefDelta: THREE.Vector3,
	frameOrOrigin: EnuFrameLike,
	target = new THREE.Vector3()
): THREE.Vector3 {

	const frame = resolveEnuFrame( frameOrOrigin );
	return target.copy( ecefDelta ).applyMatrix3( frame.ecefToEnuMatrix );

}

export function enuDeltaToEcef(
	enuDelta: THREE.Vector3,
	frameOrOrigin: EnuFrameLike,
	target = new THREE.Vector3()
): THREE.Vector3 {

	const frame = resolveEnuFrame( frameOrOrigin );
	return target.copy( enuDelta ).applyMatrix3( frame.enuToEcefMatrix );

}

export function getEcefDeltaFromGeodetic(
	point: GeodeticCoordinate,
	frameOrOrigin: EnuFrameLike,
	target = new THREE.Vector3()
): THREE.Vector3 {

	const frame = resolveEnuFrame( frameOrOrigin );
	const pointEcef = geodeticToEcef( point, tempPointEcef );

	return target.copy( pointEcef ).sub( frame.originEcef );

}

function resolveEnuFrame(frameOrOrigin: EnuFrameLike): EnuFrame {

	if ( isEnuFrame( frameOrOrigin ) ) {
		return frameOrOrigin;
	}

	return createEnuFrame( frameOrOrigin );

}

function isEnuFrame(value: EnuFrameLike): value is EnuFrame {

	return 'kind' in value && value.kind === 'enu-frame';

}
