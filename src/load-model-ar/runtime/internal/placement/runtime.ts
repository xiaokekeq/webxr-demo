import * as THREE from 'three';
import type {
	EngineeringRegistrationSolution
} from '../../../registration/engineering-registration.js';
import {
	createArFromEnuSolution,
	type ArFromEnuSolution
} from '../../../registration/ar-from-enu-solution.js';
import { composeModelQuaternionInAr } from '../../../registration/engineering-registration.js';
import type { ManualPlacementBase } from '../../../registration/manual-registration.js';
import { placeModelAt } from '../../model.js';
import type { CoarsePlacementEstimate } from '../../../shared/types.js';
import { getPlacementResidualScale } from './camera-fit.js';

const tempEuler = new THREE.Euler();
const tempSiteOffset = new THREE.Vector3();
const tempHitTestPlacementQuaternion = new THREE.Quaternion();
const tempHitTestPlacementNorth = new THREE.Vector3();

export function createAutoPlacementBase(options: {
	estimate: CoarsePlacementEstimate;
	modelTemplate: THREE.Group;
	registrationSolution: EngineeringRegistrationSolution;
	modelOrientationTarget: THREE.Quaternion;
}): ManualPlacementBase {

	const {
		estimate,
		modelTemplate,
		registrationSolution,
		modelOrientationTarget
	} = options;

	return createPlacementBaseFromArLocalizationSolution( {
		arFromEnuSolution: createArFromEnuSolution( {
			position: estimate.position,
			orientation: estimate.orientation,
			headingDeg: estimate.headingDeg,
			source: 'gps-imu',
			accuracyMeters: estimate.accuracyMeters ?? undefined
		} ),
		modelTemplate,
		registrationSolution,
		modelOrientationTarget
	} );

}

export function createPlacementBaseFromArLocalizationSolution(options: {
	arFromEnuSolution: ArFromEnuSolution;
	modelTemplate: THREE.Group;
	registrationSolution: EngineeringRegistrationSolution;
	modelOrientationTarget: THREE.Quaternion;
}): ManualPlacementBase {

	const {
		arFromEnuSolution,
		modelTemplate,
		registrationSolution,
		modelOrientationTarget
	} = options;
	const baseScale = getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale );
	const position = composeAnchoredPlacementPosition(
		arFromEnuSolution.siteOriginArPosition,
		arFromEnuSolution.orientation,
		registrationSolution.modelToSite.translation,
		tempSiteOffset
	).clone();

	return {
		position,
		orientation: flattenQuaternionToYaw(
			composeModelQuaternionInAr(
				arFromEnuSolution.orientation,
				registrationSolution,
				modelOrientationTarget
			),
			modelOrientationTarget
		).clone(),
		scale: baseScale,
		scaleAnchor: position.clone(),
		siteContext: {
			siteOriginArPosition: arFromEnuSolution.siteOriginArPosition.clone(),
			headingDeg: arFromEnuSolution.headingDeg,
			baseScale,
			source: arFromEnuSolution.source,
			timestamp: arFromEnuSolution.timestamp,
			accuracyMeters: arFromEnuSolution.accuracyMeters
		}
	};

}

export function createHitTestPlacementBase(options: {
	camera: THREE.Camera;
	groundPosition: THREE.Vector3;
	modelTemplate: THREE.Group;
	registrationSolution: EngineeringRegistrationSolution;
}): ManualPlacementBase {

	const {
		camera,
		groundPosition,
		modelTemplate,
		registrationSolution
	} = options;
	const baseScale = getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale );
	const orientation = flattenQuaternionToYaw(
		camera.getWorldQuaternion( tempHitTestPlacementQuaternion ),
		new THREE.Quaternion()
	).clone();
	const headingDeg = extractHeadingDegFromHitTestOrientation( orientation );

	return {
		position: groundPosition.clone(),
		orientation,
		scale: baseScale,
		scaleAnchor: groundPosition.clone(),
		siteContext: {
			siteOriginArPosition: groundPosition.clone(),
			headingDeg,
			baseScale,
			source: 'unknown',
			timestamp: Date.now()
		}
	};

}

function composeAnchoredPlacementPosition(
	placementAnchor: THREE.Vector3,
	siteToArQuaternion: THREE.Quaternion,
	modelSiteOffset: THREE.Vector3,
	target: THREE.Vector3
): THREE.Vector3 {

	return target
		.copy( modelSiteOffset )
		.applyQuaternion( siteToArQuaternion )
		.add( placementAnchor );

}

export function createDesktopPreviewBase(
	modelTemplate: THREE.Group,
	registrationSolution: EngineeringRegistrationSolution
): ManualPlacementBase {

	return {
		position: new THREE.Vector3(),
		orientation: new THREE.Quaternion(),
		scale: getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale ),
		scaleAnchor: new THREE.Vector3(),
		siteContext: {
			siteOriginArPosition: new THREE.Vector3(),
			headingDeg: 0,
			baseScale: getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale ),
			source: 'unknown',
			timestamp: 0
		}
	};

}

export function placeAdjustedModel(options: {
	modelTemplate: THREE.Group;
	placedModel: THREE.Group | null;
	modelAnchor: THREE.Group;
	adjustedPlacement: {
		position: THREE.Vector3;
		orientation: THREE.Quaternion;
		scale: number;
	};
}): THREE.Group {

	const { modelTemplate, placedModel, modelAnchor, adjustedPlacement } = options;

	return placeModelAt(
		modelTemplate,
		placedModel,
		modelAnchor,
		adjustedPlacement.position,
		adjustedPlacement.orientation,
		adjustedPlacement.scale
	);

}

function flattenQuaternionToYaw(
	source: THREE.Quaternion,
	target: THREE.Quaternion
): THREE.Quaternion {

	tempEuler.setFromQuaternion( source, 'YXZ' );
	target.setFromEuler( new THREE.Euler( 0, tempEuler.y, 0, 'YXZ' ) );
	return target;

}

function extractHeadingDegFromHitTestOrientation(orientation: THREE.Quaternion): number {

	tempHitTestPlacementNorth.set( 0, 1, 0 ).applyQuaternion( orientation );
	return normalizeDegrees(
		THREE.MathUtils.radToDeg( Math.atan2( - tempHitTestPlacementNorth.x, - tempHitTestPlacementNorth.z ) )
	);

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}



