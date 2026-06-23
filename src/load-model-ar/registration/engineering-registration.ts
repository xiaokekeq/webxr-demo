import * as THREE from 'three';
import type {
	DemoModelConfig,
	DemoModelControlPointCorrespondence,
	DemoModelRegistrationMode
} from '../data/demo-model-config.js';
import type { AbsoluteSiteTarget } from './coarse-registration-config.js';
import {
	createEnuFrame,
	enuToGeodetic,
	geodeticToEnu,
	type EnuFrame,
	type GeodeticCoordinate
} from './geodesy.js';

export interface EngineeringControlPoint {
	id: string;
	modelLocal: THREE.Vector3;
	worldGeodetic: GeodeticCoordinate;
	worldEnu: THREE.Vector3;
}

export interface SimilarityTransformSolution {
	rotation: THREE.Quaternion;
	translation: THREE.Vector3;
	scale: number;
	matrix: THREE.Matrix4;
	rmsErrorMeters: number;
}

export interface EngineeringRegistrationSolution {
	modelId: string;
	siteOrigin: GeodeticCoordinate;
	siteEnuFrame: EnuFrame;
	registrationMode: DemoModelRegistrationMode;
	controlPoints: EngineeringControlPoint[];
	modelToSite: SimilarityTransformSolution;
	rootSiteEnu: THREE.Vector3;
	rootWorldGeodetic: GeodeticCoordinate;
	rootHeadingDeg: number;
}

const tempRotated = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();

export function solveEngineeringRegistration(config: DemoModelConfig): EngineeringRegistrationSolution {

	const siteEnuFrame = createEnuFrame( config.siteFrame.origin );

	const controlPoints = Object.entries( config.controlPoints ).map( ( [ id, point ] ) => {
		const modelLocal = new THREE.Vector3( point.modelLocal.x, point.modelLocal.y, point.modelLocal.z );
		const worldGeodetic = point.world;
		const worldEnu = geodeticToEnu( worldGeodetic, siteEnuFrame );

		return {
			id,
			modelLocal,
			worldGeodetic,
			worldEnu
		};
	} );

	if ( controlPoints.length < config.registration.minControlPoints ) {
		throw new Error(
			`Registration requires at least ${config.registration.minControlPoints} control points, but got ${controlPoints.length}.`
		);
	}

	const modelToSite = solveSimilarityTransform(
		controlPoints.map( ( point ) => point.modelLocal ),
		controlPoints.map( ( point ) => point.worldEnu ),
		config.registration.mode
	);

	const rootSiteEnu = modelToSite.translation.clone();
	const rootWorldGeodetic = enuToGeodetic( rootSiteEnu, siteEnuFrame );
	const rootHeadingDeg = extractHeadingDegFromQuaternion( modelToSite.rotation );

	return {
		modelId: config.modelId,
		siteOrigin: config.siteFrame.origin,
		siteEnuFrame,
		registrationMode: config.registration.mode,
		controlPoints,
		modelToSite,
		rootSiteEnu,
		rootWorldGeodetic,
		rootHeadingDeg
	};

}

export function createCoarseTargetFromEngineeringSolution(
	solution: EngineeringRegistrationSolution
): AbsoluteSiteTarget {

	return {
		mode: 'absolute-site',
		label: `${solution.modelId} site origin`,
		latitude: solution.siteOrigin.lat,
		longitude: solution.siteOrigin.lon,
		altitude: solution.siteOrigin.alt,
		targetHeadingDeg: solution.rootHeadingDeg,
		assetYawOffsetDeg: 0
	};

}

export function composeModelQuaternionInAr(
	enuToArQuaternion: THREE.Quaternion,
	solution: EngineeringRegistrationSolution,
	target = new THREE.Quaternion()
): THREE.Quaternion {

	return target.copy( enuToArQuaternion ).multiply( solution.modelToSite.rotation );

}

function solveSimilarityTransform(
	sourcePoints: THREE.Vector3[],
	targetPoints: THREE.Vector3[],
	mode: DemoModelRegistrationMode
): SimilarityTransformSolution {

	const sourceCentroid = computeCentroid( sourcePoints );
	const targetCentroid = computeCentroid( targetPoints );

	const centeredSource = sourcePoints.map( ( point ) => point.clone().sub( sourceCentroid ) );
	const centeredTarget = targetPoints.map( ( point ) => point.clone().sub( targetCentroid ) );

	const covariance = computeCrossCovariance( centeredSource, centeredTarget );
	const rotation = solveHornQuaternion( covariance );

	let scale = 1;
	if ( mode === 'similarity' ) {
		let numerator = 0;
		let denominator = 0;

		for ( let index = 0; index < centeredSource.length; index += 1 ) {
			tempRotated.copy( centeredSource[ index ] ).applyQuaternion( rotation );
			numerator += centeredTarget[ index ].dot( tempRotated );
			denominator += centeredSource[ index ].lengthSq();
		}

		if ( denominator > 1e-9 ) {
			scale = numerator / denominator;
		}
	}

	const translation = targetCentroid.clone().sub(
		sourceCentroid.clone().applyQuaternion( rotation ).multiplyScalar( scale )
	);

	const matrix = new THREE.Matrix4().compose(
		translation.clone(),
		rotation.clone(),
		new THREE.Vector3( scale, scale, scale )
	);

	const rmsErrorMeters = computeRmsError( sourcePoints, targetPoints, rotation, translation, scale );

	return {
		rotation,
		translation,
		scale,
		matrix,
		rmsErrorMeters
	};

}

function computeCentroid(points: THREE.Vector3[]): THREE.Vector3 {

	const centroid = new THREE.Vector3();
	for ( const point of points ) {
		centroid.add( point );
	}

	return centroid.divideScalar( points.length );

}

function computeCrossCovariance(source: THREE.Vector3[], target: THREE.Vector3[]): number[][] {

	const matrix = [
		[ 0, 0, 0 ],
		[ 0, 0, 0 ],
		[ 0, 0, 0 ]
	];

	for ( let index = 0; index < source.length; index += 1 ) {
		const sourcePoint = source[ index ];
		const targetPoint = target[ index ];

		matrix[ 0 ][ 0 ] += targetPoint.x * sourcePoint.x;
		matrix[ 0 ][ 1 ] += targetPoint.x * sourcePoint.y;
		matrix[ 0 ][ 2 ] += targetPoint.x * sourcePoint.z;
		matrix[ 1 ][ 0 ] += targetPoint.y * sourcePoint.x;
		matrix[ 1 ][ 1 ] += targetPoint.y * sourcePoint.y;
		matrix[ 1 ][ 2 ] += targetPoint.y * sourcePoint.z;
		matrix[ 2 ][ 0 ] += targetPoint.z * sourcePoint.x;
		matrix[ 2 ][ 1 ] += targetPoint.z * sourcePoint.y;
		matrix[ 2 ][ 2 ] += targetPoint.z * sourcePoint.z;
	}

	return matrix;

}

function solveHornQuaternion(covariance: number[][]): THREE.Quaternion {

	const sxx = covariance[ 0 ][ 0 ];
	const sxy = covariance[ 0 ][ 1 ];
	const sxz = covariance[ 0 ][ 2 ];
	const syx = covariance[ 1 ][ 0 ];
	const syy = covariance[ 1 ][ 1 ];
	const syz = covariance[ 1 ][ 2 ];
	const szx = covariance[ 2 ][ 0 ];
	const szy = covariance[ 2 ][ 1 ];
	const szz = covariance[ 2 ][ 2 ];
	const trace = sxx + syy + szz;

	const hornMatrix = [
		[ trace, syz - szy, szx - sxz, sxy - syx ],
		[ syz - szy, sxx - syy - szz, sxy + syx, szx + sxz ],
		[ szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy ],
		[ sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz ]
	];

	const eigenVector = powerIterateLargestEigenVector( hornMatrix );
	tempQuaternion.set( eigenVector[ 1 ], eigenVector[ 2 ], eigenVector[ 3 ], eigenVector[ 0 ] );
	tempQuaternion.normalize();

	return tempQuaternion.clone();

}

function powerIterateLargestEigenVector(matrix: number[][]): [ number, number, number, number ] {

	let vector: [ number, number, number, number ] = [ 1, 0, 0, 0 ];

	for ( let iteration = 0; iteration < 64; iteration += 1 ) {
		const next: [ number, number, number, number ] = [
			dot4( matrix[ 0 ], vector ),
			dot4( matrix[ 1 ], vector ),
			dot4( matrix[ 2 ], vector ),
			dot4( matrix[ 3 ], vector )
		];

		const length = Math.hypot( next[ 0 ], next[ 1 ], next[ 2 ], next[ 3 ] );
		if ( length <= 1e-12 ) {
			break;
		}

		vector = [
			next[ 0 ] / length,
			next[ 1 ] / length,
			next[ 2 ] / length,
			next[ 3 ] / length
		];
	}

	return vector;

}

function computeRmsError(
	sourcePoints: THREE.Vector3[],
	targetPoints: THREE.Vector3[],
	rotation: THREE.Quaternion,
	translation: THREE.Vector3,
	scale: number
): number {

	let sumSquaredError = 0;

	for ( let index = 0; index < sourcePoints.length; index += 1 ) {
		tempRotated
			.copy( sourcePoints[ index ] )
			.applyQuaternion( rotation )
			.multiplyScalar( scale )
			.add( translation );

		sumSquaredError += tempRotated.distanceToSquared( targetPoints[ index ] );
	}

	return Math.sqrt( sumSquaredError / sourcePoints.length );

}

function extractHeadingDegFromQuaternion(quaternion: THREE.Quaternion): number {

	const matrix = new THREE.Matrix4().compose(
		new THREE.Vector3(),
		quaternion,
		tempScale.set( 1, 1, 1 )
	);
	const forward = new THREE.Vector3( 0, 0, -1 ).applyMatrix4( matrix );
	const headingRad = Math.atan2( forward.x, forward.y );

	return normalizeDegrees( THREE.MathUtils.radToDeg( headingRad ) );

}

function dot4(row: number[], vector: [ number, number, number, number ]): number {

	return row[ 0 ] * vector[ 0 ]
		+ row[ 1 ] * vector[ 1 ]
		+ row[ 2 ] * vector[ 2 ]
		+ row[ 3 ] * vector[ 3 ];

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}
