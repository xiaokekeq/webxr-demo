import type { SetStatus } from '../shared/types.js';
import type { GeodeticCoordinate } from '../registration/geodesy.js';

export interface DemoModelLocalPoint {
	x: number;
	y: number;
	z: number;
}

export interface DemoModelControlPointCorrespondence {
	modelLocal: DemoModelLocalPoint;
	world: GeodeticCoordinate;
}

export type DemoModelRegistrationMode = 'rigid' | 'similarity';

export interface DemoModelConfig {
	modelId: string;
	siteFrame: {
		origin: GeodeticCoordinate;
		axes: 'enu';
	};
	anchor: GeodeticCoordinate;
	yaw: number;
	scale: number;
	registration: {
		mode: DemoModelRegistrationMode;
		minControlPoints: number;
	};
	controlPoints: Record<string, DemoModelControlPointCorrespondence>;
}

interface LegacyControlPointShape {
	x: number;
	y: number;
	z: number;
}

interface LegacyDemoModelConfig extends Omit<DemoModelConfig, 'siteFrame' | 'registration' | 'controlPoints'> {
	siteFrame?: DemoModelConfig['siteFrame'];
	registration?: DemoModelConfig['registration'];
	controlPoints: Record<string, DemoModelControlPointCorrespondence | LegacyControlPointShape>;
}

export async function loadDemoModelConfig(
	url: string,
	setStatus: SetStatus
): Promise<DemoModelConfig> {

	setStatus( 'Loading model registration config...' );

	const response = await fetch( url );
	if ( response.ok === false ) {
		throw new Error( `Failed to load model config: HTTP ${response.status}` );
	}

	const raw = await response.json() as LegacyDemoModelConfig;
	const normalized = normalizeDemoModelConfig( raw );
	validateDemoModelConfig( normalized );

	console.info( '[Demo Model Config]', normalized );

	return normalized;

}

function normalizeDemoModelConfig(config: LegacyDemoModelConfig): DemoModelConfig {

	const siteFrame = config.siteFrame ?? {
		origin: {
			lat: config.anchor.lat,
			lon: config.anchor.lon,
			alt: config.anchor.alt
		},
		axes: 'enu'
	};

	const registration = config.registration ?? {
		mode: 'similarity',
		minControlPoints: 3
	};

	const normalizedControlPoints: Record<string, DemoModelControlPointCorrespondence> = {};

	for ( const [ id, point ] of Object.entries( config.controlPoints ) ) {
		if ( isControlPointCorrespondence( point ) ) {
			normalizedControlPoints[ id ] = point;
			continue;
		}

		normalizedControlPoints[ id ] = {
			modelLocal: point,
			world: synthesizeWorldControlPoint( point, config.anchor, config.yaw, config.scale )
		};
	}

	if ( normalizedControlPoints.ORIGIN === undefined ) {
		normalizedControlPoints.ORIGIN = {
			modelLocal: { x: 0, y: 0, z: 0 },
			world: {
				lat: config.anchor.lat,
				lon: config.anchor.lon,
				alt: config.anchor.alt
			}
		};
	}

	return {
		modelId: config.modelId,
		siteFrame,
		anchor: config.anchor,
		yaw: config.yaw,
		scale: config.scale,
		registration,
		controlPoints: normalizedControlPoints
	};

}

function validateDemoModelConfig(config: DemoModelConfig): void {

	if ( typeof config.modelId !== 'string' || config.modelId.length === 0 ) {
		throw new Error( 'Model config is missing a valid modelId.' );
	}

	if ( typeof config.siteFrame?.origin?.lat !== 'number' || typeof config.siteFrame?.origin?.lon !== 'number' ) {
		throw new Error( 'Model config is missing a valid siteFrame.origin.' );
	}

	if ( config.siteFrame.axes !== 'enu' ) {
		throw new Error( 'Only ENU site frames are supported right now.' );
	}

	if ( typeof config.anchor?.lat !== 'number' || typeof config.anchor?.lon !== 'number' ) {
		throw new Error( 'Model config is missing a valid anchor.' );
	}

	if ( typeof config.yaw !== 'number' ) {
		throw new Error( 'Model config is missing a valid yaw.' );
	}

	if ( typeof config.scale !== 'number' || Number.isFinite( config.scale ) === false || config.scale <= 0 ) {
		throw new Error( 'Model config is missing a valid scale.' );
	}

	if ( config.registration.mode !== 'rigid' && config.registration.mode !== 'similarity' ) {
		throw new Error( 'registration.mode must be "rigid" or "similarity".' );
	}

	if ( config.registration.minControlPoints < 3 ) {
		throw new Error( 'registration.minControlPoints must be at least 3.' );
	}

	if ( typeof config.controlPoints !== 'object' || config.controlPoints === null ) {
		throw new Error( 'Model config is missing valid controlPoints.' );
	}

}

function isControlPointCorrespondence(
	point: DemoModelControlPointCorrespondence | LegacyControlPointShape
): point is DemoModelControlPointCorrespondence {

	return 'modelLocal' in point && 'world' in point;

}

function synthesizeWorldControlPoint(
	localPoint: DemoModelLocalPoint,
	anchor: GeodeticCoordinate,
	yawDeg: number,
	scale: number
): GeodeticCoordinate {

	const yawRad = yawDeg * Math.PI / 180;
	const scaledX = localPoint.x * scale;
	const scaledY = localPoint.y * scale;
	const scaledZ = localPoint.z * scale;
	const eastMeters = scaledX * Math.cos( yawRad ) - scaledZ * Math.sin( yawRad );
	const northMeters = scaledX * Math.sin( yawRad ) + scaledZ * Math.cos( yawRad );
	const metersPerLat = 111320;
	const metersPerLon = 111320 * Math.cos( anchor.lat * Math.PI / 180 );

	return {
		lat: anchor.lat + northMeters / metersPerLat,
		lon: anchor.lon + eastMeters / metersPerLon,
		alt: anchor.alt + scaledY
	};

}

