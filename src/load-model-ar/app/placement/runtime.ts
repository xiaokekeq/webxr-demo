import * as THREE from 'three';
import type {
	EngineeringRegistrationSolution
} from '../../registration/engineering-registration.js';
import { composeModelQuaternionInAr } from '../../registration/engineering-registration.js';
import type { ManualPlacementBase } from '../../registration/manual-registration.js';
import { placeModelAt } from '../../render/model.js';
import type { CoarsePlacementEstimate } from '../../ui/types.js';
import { getPlacementResidualScale, getPreviewPlacementPosition } from './camera-fit.js';

export function createAutoPlacementBase(options: {
	camera: THREE.Camera;
	cameraWorldPosition: THREE.Vector3;
	groundY: number;
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
		estimate,
		modelTemplate,
		registrationSolution,
		modelOrientationTarget,
		previewDistanceMeters,
		usePreviewPlacement
	} = options;

	return {
		position: ( usePreviewPlacement
			? getPreviewPlacementPosition( camera, cameraWorldPosition, groundY, previewDistanceMeters )
			: estimate.position
		).clone(),
		orientation: composeModelQuaternionInAr(
			estimate.orientation,
			registrationSolution,
			modelOrientationTarget
		).clone(),
		scale: getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale )
	};

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
