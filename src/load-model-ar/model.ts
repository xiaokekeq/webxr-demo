import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_SCALE_CALIBRATION } from './model-scale-config.js';
import type { SetStatus } from './types.js';

const templateBounds = new THREE.Box3();
const templateSize = new THREE.Vector3();
const templateCenter = new THREE.Vector3();
const scaledSize = new THREE.Vector3();

export async function loadModelTemplate(
	url: string,
	setStatus: SetStatus,
	perModelScaleFactor = 1
): Promise<THREE.Group> {

	setStatus( '正在加载模型...' );

	const loader = new GLTFLoader();

	return await new Promise<THREE.Group>( ( resolve, reject ) => {
		loader.load(
			url,
			( gltf ) => {
				const { template, report } = createPlaceableTemplate( gltf.scene, perModelScaleFactor );

				console.info(
					'[Model Scale]',
					{
						originalSizeMeters: report.originalSize,
						originalLongestEdgeMeters: report.originalLongestEdgeMeters,
						appliedScaleFactor: report.appliedScaleFactor,
						perModelScaleFactor: report.perModelScaleFactor,
						scaledSizeMeters: report.scaledSize,
						calibrationMode: report.calibrationMode,
						note: MODEL_SCALE_CALIBRATION.note
					}
				);

				setStatus(
					`模型加载成功，原始包围盒 ${formatSize( report.originalSize )}，固定缩放 ${report.appliedScaleFactor.toFixed( 3 )}x`
				);

				resolve( template );
			},
			( event ) => {
				if ( event.total > 0 ) {
					const progress = Math.round( event.loaded / event.total * 100 );
					setStatus( `正在加载模型... ${progress}%` );
				}
			},
			( error ) => {
				console.error( 'AR model load failed:', error );
				setStatus( '模型加载失败，请检查 glb 文件路径' );
				reject( error );
			}
		);
	} );

}

export function placeModelAt(
	modelTemplate: THREE.Group,
	currentModel: THREE.Group | null,
	parent: THREE.Group,
	position: THREE.Vector3,
	orientation = new THREE.Quaternion(),
	uniformScale = 1
): THREE.Group {

	let targetModel = currentModel;

	if ( targetModel === null ) {
		targetModel = clone( modelTemplate ) as THREE.Group;
		targetModel.userData.__baseScale = targetModel.scale.clone();
		parent.add( targetModel );
	}

	targetModel.position.copy( position );
	targetModel.quaternion.copy( orientation );

	const baseScale = targetModel.userData.__baseScale instanceof THREE.Vector3
		? targetModel.userData.__baseScale
		: targetModel.scale.clone();
	targetModel.scale.copy( baseScale ).multiplyScalar( uniformScale );

	return targetModel;

}

export function clearPlacedModel(
	parent: THREE.Group,
	model: THREE.Group | null
): THREE.Group | null {

	if ( model !== null ) {
		parent.remove( model );
	}

	return null;

}

function createPlaceableTemplate(
	source: THREE.Object3D,
	perModelScaleFactor: number
): {
	template: THREE.Group;
	report: {
		originalSize: THREE.Vector3;
		originalLongestEdgeMeters: number;
		appliedScaleFactor: number;
		perModelScaleFactor: number;
		scaledSize: THREE.Vector3;
		calibrationMode: string;
	};
} {

	const wrapper = new THREE.Group();
	const content = clone( source );

	templateBounds.setFromObject( content );

	if ( templateBounds.isEmpty() ) {
		wrapper.add( content );
		return {
			template: wrapper,
			report: {
				originalSize: new THREE.Vector3(),
				originalLongestEdgeMeters: 0,
				appliedScaleFactor: 1,
				perModelScaleFactor: 1,
				scaledSize: new THREE.Vector3(),
				calibrationMode: 'empty-bounds'
			}
		};
	}

	templateBounds.getCenter( templateCenter );
	templateBounds.getSize( templateSize );

	content.position.set(
		- templateCenter.x,
		- templateBounds.min.y,
		- templateCenter.z
	);

	wrapper.add( content );

	const originalLongestEdgeMeters = Math.max( templateSize.x, templateSize.y, templateSize.z );
	const appliedScaleFactor = getAppliedScaleFactor( originalLongestEdgeMeters ) * perModelScaleFactor;
	wrapper.scale.setScalar( appliedScaleFactor );
	wrapper.userData.__bakedScaleFactor = appliedScaleFactor;

	scaledSize.copy( templateSize ).multiplyScalar( appliedScaleFactor );

	return {
		template: wrapper,
		report: {
			originalSize: templateSize.clone(),
			originalLongestEdgeMeters,
			appliedScaleFactor,
			perModelScaleFactor,
			scaledSize: scaledSize.clone(),
			calibrationMode: MODEL_SCALE_CALIBRATION.mode
		}
	};

}

function getAppliedScaleFactor(originalLongestEdgeMeters: number): number {

	if ( originalLongestEdgeMeters <= 0 ) {
		return 1;
	}

	if ( MODEL_SCALE_CALIBRATION.mode === 'fixed-factor' ) {
		return MODEL_SCALE_CALIBRATION.factor;
	}

	return MODEL_SCALE_CALIBRATION.longestEdgeMeters / originalLongestEdgeMeters;

}

function formatSize(size: THREE.Vector3): string {

	return `${size.x.toFixed( 2 )} x ${size.y.toFixed( 2 )} x ${size.z.toFixed( 2 )}m`;

}
