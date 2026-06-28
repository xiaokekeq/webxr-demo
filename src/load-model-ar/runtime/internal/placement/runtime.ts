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
import { getPlacementResidualScale, getPreviewPlacementPosition } from './camera-fit.js';

const tempEuler = new THREE.Euler();
const tempSiteOffset = new THREE.Vector3();
const tempFrontPreviewQuaternion = new THREE.Quaternion();
const tempFrontPreviewNorth = new THREE.Vector3();

export function createAutoPlacementBase(options: {
	camera: THREE.Camera;
	cameraWorldPosition: THREE.Vector3;
	groundY: number;
	groundPosition: THREE.Vector3;
	estimate: CoarsePlacementEstimate;
	modelTemplate: THREE.Group;
	registrationSolution: EngineeringRegistrationSolution;
	modelOrientationTarget: THREE.Quaternion;
	previewDistanceMeters: number;
	usePreviewPlacement: boolean;
}): ManualPlacementBase {

	const {
		camera,
		cameraWorldPosition,
		groundY,
		groundPosition,
		estimate,
		modelTemplate,
		registrationSolution,
		modelOrientationTarget,
		previewDistanceMeters,
		usePreviewPlacement
	} = options;

	if ( usePreviewPlacement === false ) {
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

	const position = getPreviewPlacementPosition(
		camera,
		cameraWorldPosition,
		groundY,
		previewDistanceMeters
	).clone();
	const baseScale = getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale );

	return {
		position,
		orientation: flattenQuaternionToYaw(
			composeModelQuaternionInAr(
				estimate.orientation,
				registrationSolution,
				modelOrientationTarget
			),
			modelOrientationTarget
		).clone(),
		scale: baseScale,
		scaleAnchor: position.clone(),
		siteContext: {
			siteOriginArPosition: estimate.position.clone(),
			headingDeg: estimate.headingDeg,
			baseScale,
			source: 'gps-imu',
			timestamp: Date.now(),
			accuracyMeters: estimate.accuracyMeters ?? undefined
		}
	};

}

export function createFrontPreviewPlacementBase(options: {
	camera: THREE.Camera;
	cameraWorldPosition: THREE.Vector3;
	groundY: number;
	modelTemplate: THREE.Group;
	registrationSolution: EngineeringRegistrationSolution;
	modelOrientationTarget: THREE.Quaternion;
	previewDistanceMeters: number;
}): ManualPlacementBase {

	const {
		camera,
		cameraWorldPosition,
		groundY,
		modelTemplate,
		registrationSolution,
		modelOrientationTarget,
		previewDistanceMeters
	} = options;
	const position = getPreviewPlacementPosition(
		camera,
		cameraWorldPosition,
		groundY,
		previewDistanceMeters
	).clone();
	const frontPreviewOrientation = flattenQuaternionToYaw(
		camera.getWorldQuaternion( tempFrontPreviewQuaternion ),
		modelOrientationTarget
	).clone();
	const baseScale = getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale );
	const headingDeg = extractHeadingDegFromPreviewOrientation( frontPreviewOrientation );

	return {
		position,
		orientation: flattenQuaternionToYaw(
			composeModelQuaternionInAr(
				frontPreviewOrientation,
				registrationSolution,
				modelOrientationTarget
			),
			modelOrientationTarget
		).clone(),
		scale: baseScale,
		scaleAnchor: position.clone(),
		siteContext: {
			siteOriginArPosition: position.clone(),
			headingDeg,
			baseScale,
			source: 'unknown',
			timestamp: Date.now()
		}
	};

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

function extractHeadingDegFromPreviewOrientation(orientation: THREE.Quaternion): number {

	tempFrontPreviewNorth.set( 0, 1, 0 ).applyQuaternion( orientation );
	return normalizeDegrees(
		THREE.MathUtils.radToDeg( Math.atan2( - tempFrontPreviewNorth.x, - tempFrontPreviewNorth.z ) )
	);

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}



