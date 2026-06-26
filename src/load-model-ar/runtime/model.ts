import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {
	attachModelSourceMetadata,
	extractModelSourceMetadata
} from '../data/model-source-metadata.js';
import type { ModelAssetTransform } from '../data/model-catalog.js';
import type { SetStatus } from '../shared/types.js';
import { MODEL_SCALE_CALIBRATION } from './model-scale-config.js';

const templateBounds = new THREE.Box3();
const templateSize = new THREE.Vector3();
const templateCenter = new THREE.Vector3();
const scaledSize = new THREE.Vector3();

export async function loadModelTemplate(
	url: string,
	setStatus: SetStatus,
	perModelScaleFactor = 1,
	materialUrl?: string,
	assetTransform?: ModelAssetTransform
): Promise<THREE.Group> {

	setStatus( '正在加载模型...' );

	if ( isObjModelUrl( url ) ) {
		return await loadObjModelTemplate( url, setStatus, perModelScaleFactor, materialUrl, assetTransform );
	}

	if ( isFbxModelUrl( url ) ) {
		return await loadFbxModelTemplate( url, setStatus, perModelScaleFactor, assetTransform );
	}

	return await loadGltfModelTemplate( url, setStatus, perModelScaleFactor, assetTransform );

}

async function loadGltfModelTemplate(
	url: string,
	setStatus: SetStatus,
	perModelScaleFactor: number,
	assetTransform?: ModelAssetTransform
): Promise<THREE.Group> {

	const loader = new GLTFLoader();

	return await new Promise<THREE.Group>( ( resolve, reject ) => {
		loader.load(
			url,
			( gltf ) => {
				const { template, report } = createPlaceableTemplate( gltf.scene, perModelScaleFactor, assetTransform );
				attachModelSourceMetadata( template, extractModelSourceMetadata( gltf.scene, 'gltf' ) );

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
				setStatus( '模型加载失败，请检查 glb 文件路径。' );
				reject( error );
			}
		);
	} );

}

async function loadFbxModelTemplate(
	url: string,
	setStatus: SetStatus,
	perModelScaleFactor: number,
	assetTransform?: ModelAssetTransform
): Promise<THREE.Group> {

	const loader = new FBXLoader();

	return await new Promise<THREE.Group>( ( resolve, reject ) => {
		loader.load(
			url,
			( object ) => {
				const { template, report } = createPlaceableTemplate( object, perModelScaleFactor, assetTransform );
				attachModelSourceMetadata( template, extractModelSourceMetadata( object, 'fbx' ) );

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
					`FBX 模型加载成功，原始包围盒 ${formatSize( report.originalSize )}，缩放 ${report.appliedScaleFactor.toFixed( 3 )}x`
				);

				resolve( template );
			},
			( event ) => {
				if ( event.total > 0 ) {
					const progress = Math.round( event.loaded / event.total * 100 );
					setStatus( `正在加载 FBX 模型... ${progress}%` );
				}
			},
			( error ) => {
				console.error( 'AR FBX model load failed:', error );
				setStatus( 'FBX 模型加载失败，请检查 fbx 文件和贴图路径。' );
				reject( error );
			}
		);
	} );

}

async function loadObjModelTemplate(
	url: string,
	setStatus: SetStatus,
	perModelScaleFactor: number,
	materialUrl?: string,
	assetTransform?: ModelAssetTransform
): Promise<THREE.Group> {

	try {
		const materials = materialUrl === undefined
			? null
			: await loadObjMaterials( materialUrl );

		const loader = new OBJLoader();
		if ( materials !== null ) {
			loader.setMaterials( materials );
		}

		const { basePath, fileName } = splitAssetUrl( url );
		loader.setPath( basePath );

		return await new Promise<THREE.Group>( ( resolve, reject ) => {
			loader.load(
				fileName,
				( object ) => {
					const { template, report } = createPlaceableTemplate( object, perModelScaleFactor, assetTransform );
					attachModelSourceMetadata( template, extractModelSourceMetadata( object, 'obj' ) );

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
						`模型加载成功，原始包围盒 ${formatSize( report.originalSize )}，缩放 ${report.appliedScaleFactor.toFixed( 3 )}x`
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
					console.error( 'AR OBJ model load failed:', error );
					setStatus( '模型加载失败，请检查 obj / mtl 文件路径。' );
					reject( error );
				}
			);
		} );
	} catch ( error ) {
		console.error( 'AR OBJ material load failed:', error );
		setStatus( '模型材质加载失败，请检查 mtl 和贴图路径。' );
		throw error;
	}

}

async function loadObjMaterials(materialUrl: string) {

	const { basePath, fileName } = splitAssetUrl( materialUrl );
	const loader = new MTLLoader();
	loader.setPath( basePath );
	loader.setResourcePath( basePath );

	return await new Promise<ReturnType<MTLLoader['parse']>>( ( resolve, reject ) => {
		loader.load(
			fileName,
			( materials ) => {
				materials.preload();
				resolve( materials );
			},
			undefined,
			reject
		);
	} );

}

function isObjModelUrl(url: string): boolean {

	return url.split( '?' )[ 0 ].toLowerCase().endsWith( '.obj' );

}

function isFbxModelUrl(url: string): boolean {

	return url.split( '?' )[ 0 ].toLowerCase().endsWith( '.fbx' );

}

function splitAssetUrl(url: string): { basePath: string; fileName: string } {

	const queryIndex = url.indexOf( '?' );
	const cleanUrl = queryIndex === -1 ? url : url.slice( 0, queryIndex );
	const slashIndex = cleanUrl.lastIndexOf( '/' );

	if ( slashIndex === -1 ) {
		return { basePath: '', fileName: url };
	}

	return {
		basePath: cleanUrl.slice( 0, slashIndex + 1 ),
		fileName: cleanUrl.slice( slashIndex + 1 ) + ( queryIndex === -1 ? '' : url.slice( queryIndex ) )
	};

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
	perModelScaleFactor: number,
	assetTransform?: ModelAssetTransform
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
	applyAssetOrientation( content, assetTransform );

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
	const calibrationScaleFactor = getCalibrationScaleFactor( originalLongestEdgeMeters, assetTransform );
	const appliedScaleFactor = calibrationScaleFactor
		* perModelScaleFactor
		* getAssetScaleFactor( assetTransform );
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
			calibrationMode: assetTransform?.disableAutoScale === true
				? 'disabled-per-model'
				: MODEL_SCALE_CALIBRATION.mode
		}
	};

}

function applyAssetOrientation(
	content: THREE.Object3D,
	assetTransform?: ModelAssetTransform
): void {

	if ( assetTransform?.upAxis === 'z' ) {
		content.rotation.x -= Math.PI / 2;
		content.updateMatrixWorld( true );
	}

}

function getAssetScaleFactor(assetTransform?: ModelAssetTransform): number {

	if (
		assetTransform === undefined
		|| assetTransform.scaleFactor === undefined
		|| assetTransform.scaleFactor <= 0
	) {
		return 1;
	}

	return assetTransform.scaleFactor;

}

function getCalibrationScaleFactor(
	originalLongestEdgeMeters: number,
	assetTransform?: ModelAssetTransform
): number {

	if ( assetTransform?.disableAutoScale === true ) {
		return 1;
	}

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
