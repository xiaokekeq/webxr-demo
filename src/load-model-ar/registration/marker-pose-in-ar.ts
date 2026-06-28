import * as THREE from 'three';

export interface MarkerPoseInAr {
	markerId: string;
	matrix: THREE.Matrix4;
	confidence?: number;
	timestamp: number;
}

export function createMarkerPoseInArFromArjsObject(args: {
	markerId: string;
	object3D: THREE.Object3D;
	confidence?: number;
	timestamp?: number;
}): MarkerPoseInAr {

	args.object3D.updateMatrixWorld( true );

	return {
		markerId: args.markerId,
		matrix: args.object3D.matrixWorld.clone(),
		confidence: args.confidence,
		timestamp: args.timestamp ?? Date.now()
	};

}
