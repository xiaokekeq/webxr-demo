import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { SetStatus } from './types.js';

const TARGET_MODEL_SIZE = 0.9;

const templateBounds = new THREE.Box3();
const templateSize = new THREE.Vector3();
const templateCenter = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();

export async function loadModelTemplate(url: string, setStatus: SetStatus): Promise<THREE.Group> {

	setStatus( '正在加载模型...' );

	const loader = new GLTFLoader();

	return await new Promise<THREE.Group>( ( resolve, reject ) => {
		loader.load(
			url,
			( gltf ) => {
				setStatus( '模型加载成功，点击 Enter AR 进入现实放置模式' );
				resolve( createPlaceableTemplate( gltf.scene ) );
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
	camera: THREE.Camera
): THREE.Group {

	let targetModel = currentModel;

	if ( targetModel === null ) {
		targetModel = clone( modelTemplate ) as THREE.Group;
		parent.add( targetModel );
	}

	targetModel.position.copy( position );
	alignModelYawToCamera( targetModel, position, camera );
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

function createPlaceableTemplate(source: THREE.Object3D): THREE.Group {

	const wrapper = new THREE.Group();
	const content = clone( source );

	templateBounds.setFromObject( content );

	if ( templateBounds.isEmpty() ) {
		wrapper.add( content );
		return wrapper;
	}

	templateBounds.getCenter( templateCenter );
	templateBounds.getSize( templateSize );

	content.position.set(
		- templateCenter.x,
		- templateBounds.min.y,
		- templateCenter.z
	);

	wrapper.add( content );

	const maxDimension = Math.max( templateSize.x, templateSize.y, templateSize.z );
	if ( maxDimension > 0 ) {
		wrapper.scale.setScalar( TARGET_MODEL_SIZE / maxDimension );
	}

	return wrapper;

}

function alignModelYawToCamera(
	object: THREE.Object3D,
	origin: THREE.Vector3,
	camera: THREE.Camera
): void {

	camera.getWorldPosition( cameraWorldPosition );
	const dx = cameraWorldPosition.x - origin.x;
	const dz = cameraWorldPosition.z - origin.z;
	object.rotation.set( 0, Math.atan2( dx, dz ), 0 );

}
