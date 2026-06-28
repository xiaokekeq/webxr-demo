import * as THREE from 'three';
import type { EngineeringRegistrationSolution } from './engineering-registration.js';
import { enuToGeodetic, type GeodeticCoordinate } from './geodesy.js';
import type {
	ManualPlacementBase,
	ManualRegistrationState
} from './manual-registration.js';
import type { SerializedResolvedManualRegistrationState } from './manual-registration-storage.js';

// This file does not solve modelLocal -> engineering ENU again.
// It only stores and restores the localized site pose in the current AR/world
// frame, i.e. the ENU -> AR local layer that coarse placement and manual
// adjustment are correcting.
export interface ResolvedManualRegistrationSitePose {
	rootSiteEnu: THREE.Vector3;
	rootWorldGeodetic: GeodeticCoordinate;
	rootYawDeg: number;
	scaleMultiplier: number;
	updatedAt: string;
}

export type ManualArSitePose = ResolvedManualRegistrationSitePose;

export function serializeResolvedManualRegistrationSitePose(
	sitePose: ResolvedManualRegistrationSitePose
): SerializedResolvedManualRegistrationState {

	return {
		version: 2,
		rootSiteEnuX: sitePose.rootSiteEnu.x,
		rootSiteEnuY: sitePose.rootSiteEnu.y,
		rootSiteEnuZ: sitePose.rootSiteEnu.z,
		rootWorldLat: sitePose.rootWorldGeodetic.lat,
		rootWorldLon: sitePose.rootWorldGeodetic.lon,
		rootWorldAlt: sitePose.rootWorldGeodetic.alt,
		rootYawDeg: sitePose.rootYawDeg,
		scaleMultiplier: sitePose.scaleMultiplier,
		updatedAt: sitePose.updatedAt
	};

}

export const serializeManualArSitePose = serializeResolvedManualRegistrationSitePose;

export function deserializeResolvedManualRegistrationSitePose(
	state: SerializedResolvedManualRegistrationState
): ResolvedManualRegistrationSitePose {

	return {
		rootSiteEnu: new THREE.Vector3( state.rootSiteEnuX, state.rootSiteEnuY, state.rootSiteEnuZ ),
		rootWorldGeodetic: {
			lat: state.rootWorldLat,
			lon: state.rootWorldLon,
			alt: state.rootWorldAlt
		},
		rootYawDeg: state.rootYawDeg,
		scaleMultiplier: state.scaleMultiplier,
		updatedAt: state.updatedAt
	};

}

export const deserializeManualArSitePose = deserializeResolvedManualRegistrationSitePose;

const tempWorldPosition = new THREE.Vector3();
const tempWorldQuaternion = new THREE.Quaternion();
const tempWorldScale = new THREE.Vector3();
const tempRootOffset = new THREE.Vector3();
const tempSiteOffset = new THREE.Vector3();

export function deriveManualRegistrationStateFromSitePose(options: {
	sitePose: ResolvedManualRegistrationSitePose;
	registrationSolution: EngineeringRegistrationSolution;
	placementHeadingDeg: number;
}): ManualRegistrationState {

	const { sitePose, registrationSolution, placementHeadingDeg } = options;
	const siteOffset = tempSiteOffset
		.copy( sitePose.rootSiteEnu )
		.sub( registrationSolution.modelToSite.translation );

	return {
		offset: convertSiteEnuToPlacementOffset( siteOffset, placementHeadingDeg ),
		yawDeg: normalizeDegrees( sitePose.rootYawDeg - registrationSolution.rootHeadingDeg ),
		scaleMultiplier: clamp( sitePose.scaleMultiplier, 0.1, 10 )
	};

}

export const deriveManualRegistrationStateFromArSitePose = deriveManualRegistrationStateFromSitePose;

export function createResolvedManualRegistrationSitePose(options: {
	placedModel: THREE.Group;
	placementBase: ManualPlacementBase;
	registrationSolution: EngineeringRegistrationSolution;
}): ResolvedManualRegistrationSitePose | null {

	const { placedModel, placementBase, registrationSolution } = options;
	const siteContext = placementBase.siteContext;
	if ( siteContext === undefined ) {
		return null;
	}

	placedModel.updateMatrixWorld( true );
	placedModel.getWorldPosition( tempWorldPosition );
	placedModel.getWorldQuaternion( tempWorldQuaternion );
	placedModel.getWorldScale( tempWorldScale );

	const siteOffset = convertPlacementOffsetToSiteEnu(
		tempRootOffset.copy( tempWorldPosition ).sub( siteContext.siteOriginArPosition ),
		siteContext.headingDeg
	);
	const rootSiteEnu = registrationSolution.modelToSite.translation.clone().add( siteOffset );
	const worldGeodetic = enuToGeodetic( rootSiteEnu, registrationSolution.siteEnuFrame );

	return {
		rootSiteEnu,
		rootWorldGeodetic: worldGeodetic,
		rootYawDeg: normalizeDegrees( extractYawDeg( tempWorldQuaternion ) - siteContext.headingDeg ),
		scaleMultiplier: clamp( tempWorldScale.x / siteContext.baseScale, 0.1, 10 ),
		updatedAt: new Date().toISOString()
	};

}

export const createManualArSitePoseFromPlacedModel = createResolvedManualRegistrationSitePose;

export function convertSiteEnuToPlacementOffset(
	siteOffset: THREE.Vector3,
	headingDeg: number
): THREE.Vector3 {

	// Convert a site-space ENU delta into the current AR-local placement delta.
	const headingRad = THREE.MathUtils.degToRad( headingDeg );
	const sinHeading = Math.sin( headingRad );
	const cosHeading = Math.cos( headingRad );

	return new THREE.Vector3(
		siteOffset.x * cosHeading - siteOffset.y * sinHeading,
		siteOffset.z,
		- siteOffset.x * sinHeading - siteOffset.y * cosHeading
	);

}

export function convertPlacementOffsetToSiteEnu(
	placementOffset: THREE.Vector3,
	headingDeg: number
): THREE.Vector3 {

	// Convert the current AR-local placement delta back into site-space ENU.
	const headingRad = THREE.MathUtils.degToRad( headingDeg );
	const sinHeading = Math.sin( headingRad );
	const cosHeading = Math.cos( headingRad );

	return new THREE.Vector3(
		placementOffset.x * cosHeading - placementOffset.z * sinHeading,
		- placementOffset.x * sinHeading - placementOffset.z * cosHeading,
		placementOffset.y
	);

}

function extractYawDeg(quaternion: THREE.Quaternion): number {

	const euler = new THREE.Euler().setFromQuaternion( quaternion, 'YXZ' );
	return THREE.MathUtils.radToDeg( euler.y );

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}

function clamp(value: number, min: number, max: number): number {

	return Math.min( Math.max( value, min ), max );

}
