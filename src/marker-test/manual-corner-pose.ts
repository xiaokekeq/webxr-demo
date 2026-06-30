import * as THREE from 'three';
import type { MarkerPoseInAr } from '../load-model-ar/registration/marker-pose-in-ar.js';

export interface ManualMarkerCornerPoint {
	x: number;
	y: number;
}

export interface ManualCornerPoseEstimate {
	markerPoseInAr: MarkerPoseInAr;
	reprojectionErrorPx: number;
	iterations: number;
}

const MARKER_LOCAL_CORNERS = [
	new THREE.Vector3( -0.5, 0, -0.5 ),
	new THREE.Vector3( 0.5, 0, -0.5 ),
	new THREE.Vector3( 0.5, 0, 0.5 ),
	new THREE.Vector3( -0.5, 0, 0.5 )
] as const;

const tempCameraOrigin = new THREE.Vector3();
const tempUnprojectPoint = new THREE.Vector3();
const tempWorldPoint = new THREE.Vector3();
const tempProjectedPoint = new THREE.Vector3();
const tempProjectionMatrixInverse = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3( 1, 1, 1 );
const tempEuler = new THREE.Euler( 0, 0, 0, 'XYZ' );
const tempSolvePosition = new THREE.Vector3();
const tempSolveQuaternion = new THREE.Quaternion();
const tempSolveMatrix = new THREE.Matrix4();

export function estimateMarkerPoseFromManualCorners(args: {
	markerId: string;
	corners: readonly ManualMarkerCornerPoint[];
	markerSizeMeters: number;
	camera: THREE.Camera;
	imageWidth: number;
	imageHeight: number;
	timestamp?: number;
}): ManualCornerPoseEstimate {

	if ( args.corners.length !== 4 ) {
		throw new Error( 'Manual corner pose estimation requires exactly 4 corner points.' );
	}

	prepareCameraForProjection( args.camera );

	const initialState = buildInitialState( args );
	let bestState = initialState.slice();
	let bestError = computeReprojectionError( bestState, args );
	let damping = 1e-3;
	let iterations = 0;

	for ( iterations = 0; iterations < 32; iterations += 1 ) {
		const residuals = computeResiduals( bestState, args );
		const jacobian = computeNumericJacobian( bestState, residuals, args );
		const step = solveNormalEquation( jacobian, residuals, damping );

		if ( step === null ) {
			break;
		}

		const candidateState = bestState.map( ( value, index ) => value + step[ index ] );
		const candidateError = computeReprojectionError( candidateState, args );

		if ( Number.isFinite( candidateError ) === false ) {
			damping *= 4;
			continue;
		}

		if ( candidateError < bestError ) {
			bestState = candidateState;
			bestError = candidateError;
			damping = Math.max( 1e-6, damping * 0.5 );

			const stepMagnitude = Math.sqrt( step.reduce( ( sum, value ) => sum + value * value, 0 ) );
			if ( stepMagnitude < 1e-5 ) {
				break;
			}
		} else {
			damping *= 4;
		}
	}

	const markerMatrix = composeMarkerMatrixFromState( bestState );

	return {
		markerPoseInAr: {
			markerId: args.markerId,
			matrix: markerMatrix,
			confidence: computeConfidenceFromError( bestError ),
			timestamp: args.timestamp ?? Date.now()
		},
		reprojectionErrorPx: bestError,
		iterations
	};

}

function buildInitialState(args: {
	corners: readonly ManualMarkerCornerPoint[];
	markerSizeMeters: number;
	camera: THREE.Camera;
	imageWidth: number;
	imageHeight: number;
}): number[] {

	const center = args.corners.reduce(
		( accumulator, point ) => {
			accumulator.x += point.x;
			accumulator.y += point.y;
			return accumulator;
		},
		{ x: 0, y: 0 }
	);
	center.x /= args.corners.length;
	center.y /= args.corners.length;

	const widthPixels = (
		distance2d( args.corners[ 0 ], args.corners[ 1 ] )
		+ distance2d( args.corners[ 2 ], args.corners[ 3 ] )
	) / 2;
	const heightPixels = (
		distance2d( args.corners[ 1 ], args.corners[ 2 ] )
		+ distance2d( args.corners[ 3 ], args.corners[ 0 ] )
	) / 2;
	const averagePixels = Math.max( 24, ( widthPixels + heightPixels ) / 2 );
	const focalXPixels = Math.abs( args.camera.projectionMatrix.elements[ 0 ] ) * args.imageWidth * 0.5;
	const depthGuess = Math.max( 0.15, args.markerSizeMeters * focalXPixels / averagePixels );
	const centerRay = pixelToWorldRay( center.x, center.y, args.imageWidth, args.imageHeight, args.camera );
	const centerScale = Math.abs( centerRay.direction.z ) < 1e-5
		? depthGuess
		: -depthGuess / centerRay.direction.z;
	const position = centerRay.direction.clone().multiplyScalar( centerScale ).add( centerRay.origin );

	const edgeAngle = Math.atan2(
		args.corners[ 1 ].y - args.corners[ 0 ].y,
		args.corners[ 1 ].x - args.corners[ 0 ].x
	);
	const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3( 0, 1, 0 ),
		new THREE.Vector3( 0, 0, 1 )
	);
	const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3( 0, 0, 1 ),
		-edgeAngle
	);

	tempEuler.setFromQuaternion(
		baseQuaternion.multiply( rollQuaternion ),
		'XYZ'
	);

	if ( position.z > -0.05 ) {
		position.z = -depthGuess;
	}

	return [ position.x, position.y, position.z, tempEuler.x, tempEuler.y, tempEuler.z ];

}

function computeResiduals(
	state: readonly number[],
	args: {
		corners: readonly ManualMarkerCornerPoint[];
		markerSizeMeters: number;
		camera: THREE.Camera;
		imageWidth: number;
		imageHeight: number;
	}
): number[] {

	const residuals: number[] = [];
	const markerMatrix = composeMarkerMatrixFromState( state );
	const objectPoints = getScaledMarkerCorners( args.markerSizeMeters );

	for ( let index = 0; index < objectPoints.length; index += 1 ) {
		const projectedPoint = projectPointToImage(
			objectPoints[ index ],
			markerMatrix,
			args.camera,
			args.imageWidth,
			args.imageHeight
		);
		residuals.push( projectedPoint.x - args.corners[ index ].x );
		residuals.push( projectedPoint.y - args.corners[ index ].y );
	}

	return residuals;

}

function computeNumericJacobian(
	state: readonly number[],
	baseResiduals: readonly number[],
	args: {
		corners: readonly ManualMarkerCornerPoint[];
		markerSizeMeters: number;
		camera: THREE.Camera;
		imageWidth: number;
		imageHeight: number;
	}
): number[][] {

	const jacobian = Array.from( { length: baseResiduals.length }, () => Array( state.length ).fill( 0 ) );

	for ( let column = 0; column < state.length; column += 1 ) {
		const epsilon = column < 3 ? 1e-4 : 1e-4;
		const nextState = state.slice();
		nextState[ column ] += epsilon;
		const nextResiduals = computeResiduals( nextState, args );

		for ( let row = 0; row < baseResiduals.length; row += 1 ) {
			jacobian[ row ][ column ] = ( nextResiduals[ row ] - baseResiduals[ row ] ) / epsilon;
		}
	}

	return jacobian;

}

function solveNormalEquation(
	jacobian: readonly number[][],
	residuals: readonly number[],
	damping: number
): number[] | null {

	const columnCount = jacobian[ 0 ]?.length ?? 0;
	if ( columnCount === 0 ) {
		return null;
	}

	const normalMatrix = Array.from( { length: columnCount }, () => Array( columnCount ).fill( 0 ) );
	const normalVector = Array( columnCount ).fill( 0 );

	for ( let row = 0; row < jacobian.length; row += 1 ) {
		const jacobianRow = jacobian[ row ];
		const residual = residuals[ row ];

		for ( let column = 0; column < columnCount; column += 1 ) {
			normalVector[ column ] -= jacobianRow[ column ] * residual;

			for ( let inner = 0; inner < columnCount; inner += 1 ) {
				normalMatrix[ column ][ inner ] += jacobianRow[ column ] * jacobianRow[ inner ];
			}
		}
	}

	for ( let diagonal = 0; diagonal < columnCount; diagonal += 1 ) {
		normalMatrix[ diagonal ][ diagonal ] += damping;
	}

	return solveLinearSystem( normalMatrix, normalVector );

}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {

	const size = vector.length;
	const augmented = matrix.map( ( row, rowIndex ) => [ ...row, vector[ rowIndex ] ] );

	for ( let pivotIndex = 0; pivotIndex < size; pivotIndex += 1 ) {
		let bestRowIndex = pivotIndex;
		let bestPivotMagnitude = Math.abs( augmented[ pivotIndex ][ pivotIndex ] );

		for ( let rowIndex = pivotIndex + 1; rowIndex < size; rowIndex += 1 ) {
			const pivotMagnitude = Math.abs( augmented[ rowIndex ][ pivotIndex ] );
			if ( pivotMagnitude > bestPivotMagnitude ) {
				bestPivotMagnitude = pivotMagnitude;
				bestRowIndex = rowIndex;
			}
		}

		if ( bestPivotMagnitude < 1e-9 ) {
			return null;
		}

		if ( bestRowIndex !== pivotIndex ) {
			const tempRow = augmented[ pivotIndex ];
			augmented[ pivotIndex ] = augmented[ bestRowIndex ];
			augmented[ bestRowIndex ] = tempRow;
		}

		const pivotValue = augmented[ pivotIndex ][ pivotIndex ];
		for ( let columnIndex = pivotIndex; columnIndex <= size; columnIndex += 1 ) {
			augmented[ pivotIndex ][ columnIndex ] /= pivotValue;
		}

		for ( let rowIndex = 0; rowIndex < size; rowIndex += 1 ) {
			if ( rowIndex === pivotIndex ) {
				continue;
			}

			const factor = augmented[ rowIndex ][ pivotIndex ];
			if ( Math.abs( factor ) < 1e-12 ) {
				continue;
			}

			for ( let columnIndex = pivotIndex; columnIndex <= size; columnIndex += 1 ) {
				augmented[ rowIndex ][ columnIndex ] -= factor * augmented[ pivotIndex ][ columnIndex ];
			}
		}
	}

	return augmented.map( ( row ) => row[ size ] );

}

function computeReprojectionError(
	state: readonly number[],
	args: {
		corners: readonly ManualMarkerCornerPoint[];
		markerSizeMeters: number;
		camera: THREE.Camera;
		imageWidth: number;
		imageHeight: number;
	}
): number {

	const residuals = computeResiduals( state, args );
	const squaredError = residuals.reduce( ( sum, value ) => sum + value * value, 0 );
	return Math.sqrt( squaredError / residuals.length );

}

function composeMarkerMatrixFromState(state: readonly number[]): THREE.Matrix4 {

	tempSolvePosition.set( state[ 0 ], state[ 1 ], state[ 2 ] );
	tempEuler.set( state[ 3 ], state[ 4 ], state[ 5 ], 'XYZ' );
	tempSolveQuaternion.setFromEuler( tempEuler );
	return tempSolveMatrix.compose(
		tempSolvePosition.clone(),
		tempSolveQuaternion.clone(),
		tempScale
	).clone();

}

function getScaledMarkerCorners(markerSizeMeters: number): THREE.Vector3[] {

	return MARKER_LOCAL_CORNERS.map( ( point ) => point.clone().multiplyScalar( markerSizeMeters ) );

}

function projectPointToImage(
	localPoint: THREE.Vector3,
	markerMatrix: THREE.Matrix4,
	camera: THREE.Camera,
	imageWidth: number,
	imageHeight: number
): ManualMarkerCornerPoint {

	tempWorldPoint.copy( localPoint ).applyMatrix4( markerMatrix );
	tempProjectedPoint.copy( tempWorldPoint ).project( camera );

	return {
		x: ( tempProjectedPoint.x * 0.5 + 0.5 ) * imageWidth,
		y: ( -tempProjectedPoint.y * 0.5 + 0.5 ) * imageHeight
	};

}

function pixelToWorldRay(
	x: number,
	y: number,
	imageWidth: number,
	imageHeight: number,
	camera: THREE.Camera
): {
	origin: THREE.Vector3;
	direction: THREE.Vector3;
} {

	const ndcX = x / imageWidth * 2 - 1;
	const ndcY = -( y / imageHeight ) * 2 + 1;

	tempCameraOrigin.setFromMatrixPosition( camera.matrixWorld );
	tempProjectionMatrixInverse.copy( camera.projectionMatrix ).invert();
	tempUnprojectPoint
		.set( ndcX, ndcY, 0.5 )
		.applyMatrix4( tempProjectionMatrixInverse )
		.applyMatrix4( camera.matrixWorld );

	return {
		origin: tempCameraOrigin.clone(),
		direction: tempUnprojectPoint.sub( tempCameraOrigin ).normalize()
	};

}

function prepareCameraForProjection(camera: THREE.Camera): void {

	camera.updateMatrixWorld( true );
	camera.matrixWorldInverse.copy( camera.matrixWorld ).invert();
	camera.projectionMatrixInverse.copy( camera.projectionMatrix ).invert();

}

function distance2d(a: ManualMarkerCornerPoint, b: ManualMarkerCornerPoint): number {

	return Math.hypot( a.x - b.x, a.y - b.y );

}

function computeConfidenceFromError(reprojectionErrorPx: number): number {

	return THREE.MathUtils.clamp( 1 - reprojectionErrorPx / 40, 0.05, 1 );

}
