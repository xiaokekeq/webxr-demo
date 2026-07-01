import * as THREE from 'three';
import {
	createArFromEnuSolution,
	type ArFromEnuSolution
} from './ar-from-enu-solution.js';
import { solveSimilarityTransform } from './engineering-registration.js';
import type {
	DemoModelConfig,
	MarkerEngineeringConfig
} from '../data/demo-model-config.js';
import { createEnuFrame, geodeticToEnu } from './geodesy.js';
import type { MarkerPoseInAr } from './marker-pose-in-ar.js';

export interface MarkerLocalizationCorrespondence {
	id: string;
	siteEnu: THREE.Vector3;
	arPosition: THREE.Vector3;
}

export interface MarkerLocalizationSolution {
	arFromEnuSolution: ArFromEnuSolution;
	matrix: THREE.Matrix4;
	siteOriginArPosition: THREE.Vector3;
	orientation: THREE.Quaternion;
	headingDeg: number;
	rmsErrorMeters: number;
	correspondenceCount: number;
	source: 'marker';
}

export interface MarkerPoseInEnu {
	markerId: string;
	matrix: THREE.Matrix4;
	sizeMeters: number;
}

export interface MarkerCornerInEnu {
	id: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';
	label: string;
	position: THREE.Vector3;
}

export function solveMarkerLocalization(args: {
	correspondences: MarkerLocalizationCorrespondence[];
	orientation?: THREE.Quaternion;
	headingDeg?: number;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	sessionId?: string | null;
	timestamp?: number;
} | {
	markerId: string;
	markerPoseInEnu: MarkerPoseInEnu;
	markerPoseInAr: MarkerPoseInAr;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp?: number;
}): MarkerLocalizationSolution {

	if ( isSingleMarkerPoseLocalizationArgs( args ) ) {
		return solveMarkerLocalizationFromSingleMarkerPose( args );
	}

	const correspondences = args.correspondences.filter( isValidCorrespondence );
	if ( correspondences.length === 0 ) {
		throw new Error( 'Marker localization requires at least one valid correspondence.' );
	}

	let orientation: THREE.Quaternion;
	let siteOriginArPosition: THREE.Vector3;
	let rmsErrorMeters = 0;

	if ( correspondences.length >= 3 ) {
		const rigidSolution = solveSimilarityTransform(
			correspondences.map( ( item ) => item.siteEnu ),
			correspondences.map( ( item ) => item.arPosition ),
			'rigid'
		);

		orientation = rigidSolution.rotation.clone();
		siteOriginArPosition = rigidSolution.translation.clone();
		rmsErrorMeters = rigidSolution.rmsErrorMeters;
	} else {
		if ( args.orientation === undefined ) {
			throw new Error(
				'Marker localization with fewer than 3 correspondences requires an explicit orientation.'
			);
		}

		orientation = args.orientation.clone();
		siteOriginArPosition = solveSiteOriginArPositionFromKnownOrientation(
			correspondences,
			orientation
		);
	}

	const headingDeg = args.headingDeg ?? extractHeadingDegFromEnuToArOrientation( orientation );
	const arFromEnuSolution = createArFromEnuSolution( {
		position: siteOriginArPosition,
		orientation,
		headingDeg,
		source: 'marker',
		sessionId: args.sessionId ?? null,
		accuracyMeters: args.accuracyMeters,
		yawAccuracyDegrees: args.yawAccuracyDegrees,
		timestamp: args.timestamp
	} );

	console.info( '[MarkerLocalization]', {
		correspondenceCount: correspondences.length,
		rmsErrorMeters,
		source: arFromEnuSolution.source,
		siteOriginArPosition: arFromEnuSolution.siteOriginArPosition,
		headingDeg: arFromEnuSolution.headingDeg,
		matrix: arFromEnuSolution.matrix
	} );

	return {
		arFromEnuSolution,
		matrix: arFromEnuSolution.matrix.clone(),
		siteOriginArPosition: arFromEnuSolution.siteOriginArPosition.clone(),
		orientation: arFromEnuSolution.orientation.clone(),
		headingDeg: arFromEnuSolution.headingDeg,
		rmsErrorMeters,
		correspondenceCount: correspondences.length,
		source: 'marker'
	};

}

export function resolveMarkerPoseInEnu(
	config: DemoModelConfig,
	markerId: string
): MarkerPoseInEnu {

	const markerConfig = config.markers.find( ( marker ) => marker.id === markerId );
	if ( markerConfig === undefined ) {
		throw new Error( `Marker "${markerId}" was not found in config.` );
	}

	const siteEnuFrame = createEnuFrame( config.siteFrame.origin );
	const resolvedEnu = resolveMarkerEnuPosition( config, markerConfig, siteEnuFrame );
	const yawDeg = markerConfig.yawDeg ?? 0;
	const matrix = new THREE.Matrix4().compose(
		new THREE.Vector3( resolvedEnu.east, resolvedEnu.north, resolvedEnu.up ),
		new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3( 0, 0, 1 ),
			THREE.MathUtils.degToRad( yawDeg )
		),
		new THREE.Vector3( 1, 1, 1 )
	);

	console.info( '[MarkerEngineeringConfig]', {
		markerId: markerConfig.id,
		bindControlPointId: markerConfig.bindControlPointId ?? null,
		sizeMeters: markerConfig.sizeMeters,
		enu: resolvedEnu,
		yawDeg,
		markerPoseInEnu: {
			matrix
		}
	} );

	return {
		markerId: markerConfig.id,
		matrix,
		sizeMeters: markerConfig.sizeMeters
	};

}

export function resolveMarkerCornersInEnu(
	config: DemoModelConfig,
	markerId: string
): MarkerCornerInEnu[] {

	const markerPoseInEnu = resolveMarkerPoseInEnu( config, markerId );
	markerPoseInEnu.matrix.decompose(
		tempMarkerEnuPosition,
		tempMarkerEnuQuaternion,
		tempMarkerEnuScale
	);

	const halfSize = markerPoseInEnu.sizeMeters * 0.5;
	const corners: Array<Omit<MarkerCornerInEnu, 'position'> & { local: THREE.Vector3 }> = [
		{
			id: 'top-left',
			label: '左上角',
			local: new THREE.Vector3( - halfSize, halfSize, 0 )
		},
		{
			id: 'top-right',
			label: '右上角',
			local: new THREE.Vector3( halfSize, halfSize, 0 )
		},
		{
			id: 'bottom-right',
			label: '右下角',
			local: new THREE.Vector3( halfSize, - halfSize, 0 )
		},
		{
			id: 'bottom-left',
			label: '左下角',
			local: new THREE.Vector3( - halfSize, - halfSize, 0 )
		}
	];

	return corners.map( ( corner ) => ( {
		id: corner.id,
		label: corner.label,
		position: corner.local
			.clone()
			.applyQuaternion( tempMarkerEnuQuaternion )
			.add( tempMarkerEnuPosition )
	} ) );

}

const tempSitePointInAr = new THREE.Vector3();
const tempAverageTranslation = new THREE.Vector3();
const tempNorthInAr = new THREE.Vector3();
const tempControlPointEnu = new THREE.Vector3();
const tempMarkerEnuPosition = new THREE.Vector3();
const tempMarkerArPosition = new THREE.Vector3();
const tempMarkerEnuQuaternion = new THREE.Quaternion();
const tempMarkerArQuaternion = new THREE.Quaternion();
const tempMarkerEnuScale = new THREE.Vector3();
const tempMarkerArScale = new THREE.Vector3();
const tempMarkerOrientation = new THREE.Quaternion();
const tempInverseMarkerEnuQuaternion = new THREE.Quaternion();

function solveSiteOriginArPositionFromKnownOrientation(
	correspondences: MarkerLocalizationCorrespondence[],
	orientation: THREE.Quaternion
): THREE.Vector3 {

	tempAverageTranslation.set( 0, 0, 0 );

	for ( const item of correspondences ) {
		tempSitePointInAr.copy( item.siteEnu ).applyQuaternion( orientation );
		tempAverageTranslation.add(
			item.arPosition.clone().sub( tempSitePointInAr )
		);
	}

	return tempAverageTranslation.divideScalar( correspondences.length ).clone();

}

function solveMarkerLocalizationFromSingleMarkerPose(args: {
	markerId: string;
	markerPoseInEnu: MarkerPoseInEnu;
	markerPoseInAr: MarkerPoseInAr;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp?: number;
}): MarkerLocalizationSolution {

	args.markerPoseInEnu.matrix.decompose(
		tempMarkerEnuPosition,
		tempMarkerEnuQuaternion,
		tempMarkerEnuScale
	);
	args.markerPoseInAr.matrix.decompose(
		tempMarkerArPosition,
		tempMarkerArQuaternion,
		tempMarkerArScale
	);

	const orientation = tempMarkerOrientation
		.copy( tempMarkerArQuaternion )
		.multiply(
			tempInverseMarkerEnuQuaternion.copy( tempMarkerEnuQuaternion ).invert()
		)
		.clone();

	return solveMarkerLocalization( {
		correspondences: [
			{
				id: args.markerId,
				siteEnu: tempMarkerEnuPosition.clone(),
				arPosition: tempMarkerArPosition.clone()
			}
		],
		orientation,
		accuracyMeters: args.accuracyMeters,
		yawAccuracyDegrees: args.yawAccuracyDegrees,
		timestamp: args.timestamp ?? args.markerPoseInAr.timestamp
	} );

}

function extractHeadingDegFromEnuToArOrientation(orientation: THREE.Quaternion): number {

	tempNorthInAr.set( 0, 1, 0 ).applyQuaternion( orientation );
	return normalizeDegrees( THREE.MathUtils.radToDeg( Math.atan2( - tempNorthInAr.x, - tempNorthInAr.z ) ) );

}

function resolveMarkerEnuPosition(
	config: DemoModelConfig,
	markerConfig: MarkerEngineeringConfig,
	siteEnuFrame: ReturnType<typeof createEnuFrame>
): {
	east: number;
	north: number;
	up: number;
} {

	if ( markerConfig.bindControlPointId !== undefined ) {
		const controlPoint = config.controlPoints[ markerConfig.bindControlPointId ];
		if ( controlPoint === undefined ) {
			throw new Error(
				`Marker "${markerConfig.id}" references missing control point "${markerConfig.bindControlPointId}".`
			);
		}

		const controlPointEnu = geodeticToEnu( controlPoint.world, siteEnuFrame, tempControlPointEnu );
		return {
			east: controlPointEnu.x,
			north: controlPointEnu.y,
			up: controlPointEnu.z
		};
	}

	if ( markerConfig.enu === undefined ) {
		throw new Error( `Marker "${markerConfig.id}" is missing ENU coordinates.` );
	}

	return {
		east: markerConfig.enu.east,
		north: markerConfig.enu.north,
		up: markerConfig.enu.up ?? 0
	};

}

function isSingleMarkerPoseLocalizationArgs(args: {
	correspondences: MarkerLocalizationCorrespondence[];
	orientation?: THREE.Quaternion;
	headingDeg?: number;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp?: number;
} | {
	markerId: string;
	markerPoseInEnu: MarkerPoseInEnu;
	markerPoseInAr: MarkerPoseInAr;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp?: number;
}): args is {
	markerId: string;
	markerPoseInEnu: MarkerPoseInEnu;
	markerPoseInAr: MarkerPoseInAr;
	accuracyMeters?: number;
	yawAccuracyDegrees?: number;
	timestamp?: number;
} {

	return 'markerPoseInEnu' in args && 'markerPoseInAr' in args;

}

function isValidCorrespondence(value: MarkerLocalizationCorrespondence): boolean {

	return value.id.trim().length > 0
		&& isFiniteVector3( value.siteEnu )
		&& isFiniteVector3( value.arPosition );

}

function isFiniteVector3(value: THREE.Vector3): boolean {

	return Number.isFinite( value.x )
		&& Number.isFinite( value.y )
		&& Number.isFinite( value.z );

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}
