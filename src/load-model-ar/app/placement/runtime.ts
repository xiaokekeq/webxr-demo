import * as THREE from 'three';
import type {
	EngineeringRegistrationSolution
} from '../../registration/engineering-registration.js';
import { composeModelQuaternionInAr } from '../../registration/engineering-registration.js';
import type { ManualPlacementBase } from '../../registration/manual-registration.js';
import { placeModelAt } from '../../render/model.js';
import type { CoarsePlacementEstimate } from '../../ui/types.js';
import {
	clampPlacementScaleToCameraView,
	getPlacementResidualScale,
	getPreviewPlacementPosition
} from './camera-fit.js';

const tempEuler = new THREE.Euler();
const tempSiteOffset = new THREE.Vector3();

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
	maxScreenRatio: number;
	minFitDistanceMeters: number;
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
		usePreviewPlacement,
		maxScreenRatio,
		minFitDistanceMeters
	} = options;

	const position = ( usePreviewPlacement
		? getPreviewPlacementPosition( camera, cameraWorldPosition, groundY, previewDistanceMeters )
		: composeAnchoredPlacementPosition(
			groundPosition,
			estimate.orientation,
			registrationSolution.modelToSite.translation,
			tempSiteOffset
		)
	).clone();
	const residualScale = getPlacementResidualScale(
		modelTemplate,
		registrationSolution.modelToSite.scale
	);

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
		scale: clampPlacementScaleToCameraView( {
			camera,
			modelTemplate,
			position,
			scale: residualScale,
			maxScreenRatio,
			minDistanceMeters: minFitDistanceMeters
		} )
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
		scale: getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale )
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
