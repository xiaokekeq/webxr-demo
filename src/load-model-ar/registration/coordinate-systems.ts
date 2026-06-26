import type { GeodeticCoordinate } from './geodesy.js';

export type SupportedCoordType = 'wgs84' | 'gcj02' | 'unknown';

const EARTH_SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;

export function normalizeCoordType(coordType: string | null | undefined): SupportedCoordType {

	if ( typeof coordType !== 'string' ) {
		return 'unknown';
	}

	const normalized = coordType.trim().toLowerCase();
	if ( normalized === 'wgs84' || normalized === 'wgs-84' ) {
		return 'wgs84';
	}

	if ( normalized === 'gcj02' || normalized === 'gcj-02' ) {
		return 'gcj02';
	}

	return 'unknown';

}

export function convertGeodeticToWgs84(
	coordinate: GeodeticCoordinate,
	coordType: string | null | undefined
): GeodeticCoordinate {

	const normalizedCoordType = normalizeCoordType( coordType );
	if ( normalizedCoordType !== 'gcj02' ) {
		return { ...coordinate };
	}

	const { lat, lon } = gcj02ToWgs84( coordinate.lat, coordinate.lon );
	return {
		lat,
		lon,
		alt: coordinate.alt
	};

}

function gcj02ToWgs84(lat: number, lon: number): { lat: number; lon: number } {

	if ( isOutsideChina( lat, lon ) ) {
		return { lat, lon };
	}

	let wgsLat = lat;
	let wgsLon = lon;

	for ( let iteration = 0; iteration < 4; iteration += 1 ) {
		const gcjGuess = wgs84ToGcj02( wgsLat, wgsLon );
		const latDelta = gcjGuess.lat - lat;
		const lonDelta = gcjGuess.lon - lon;
		wgsLat -= latDelta;
		wgsLon -= lonDelta;
	}

	return {
		lat: wgsLat,
		lon: wgsLon
	};

}

function wgs84ToGcj02(lat: number, lon: number): { lat: number; lon: number } {

	if ( isOutsideChina( lat, lon ) ) {
		return { lat, lon };
	}

	const delta = computeChinaOffset( lat, lon );
	return {
		lat: lat + delta.lat,
		lon: lon + delta.lon
	};

}

function computeChinaOffset(lat: number, lon: number): { lat: number; lon: number } {

	const transformedLat = transformLatitude( lon - 105.0, lat - 35.0 );
	const transformedLon = transformLongitude( lon - 105.0, lat - 35.0 );
	const latitudeRad = lat / 180.0 * Math.PI;
	const sinLatitude = Math.sin( latitudeRad );
	const magic = 1 - ECCENTRICITY_SQUARED * sinLatitude * sinLatitude;
	const sqrtMagic = Math.sqrt( magic );

	return {
		lat: ( transformedLat * 180.0 )
			/ ( ( EARTH_SEMI_MAJOR_AXIS * ( 1 - ECCENTRICITY_SQUARED ) ) / ( magic * sqrtMagic ) * Math.PI ),
		lon: ( transformedLon * 180.0 )
			/ ( EARTH_SEMI_MAJOR_AXIS / sqrtMagic * Math.cos( latitudeRad ) * Math.PI )
	};

}

function isOutsideChina(lat: number, lon: number): boolean {

	return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;

}

function transformLatitude(x: number, y: number): number {

	let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt( Math.abs( x ) );
	result += ( 20.0 * Math.sin( 6.0 * x * Math.PI ) + 20.0 * Math.sin( 2.0 * x * Math.PI ) ) * 2.0 / 3.0;
	result += ( 20.0 * Math.sin( y * Math.PI ) + 40.0 * Math.sin( y / 3.0 * Math.PI ) ) * 2.0 / 3.0;
	result += ( 160.0 * Math.sin( y / 12.0 * Math.PI ) + 320.0 * Math.sin( y * Math.PI / 30.0 ) ) * 2.0 / 3.0;
	return result;

}

function transformLongitude(x: number, y: number): number {

	let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt( Math.abs( x ) );
	result += ( 20.0 * Math.sin( 6.0 * x * Math.PI ) + 20.0 * Math.sin( 2.0 * x * Math.PI ) ) * 2.0 / 3.0;
	result += ( 20.0 * Math.sin( x * Math.PI ) + 40.0 * Math.sin( x / 3.0 * Math.PI ) ) * 2.0 / 3.0;
	result += ( 150.0 * Math.sin( x / 12.0 * Math.PI ) + 300.0 * Math.sin( x / 30.0 * Math.PI ) ) * 2.0 / 3.0;
	return result;

}
