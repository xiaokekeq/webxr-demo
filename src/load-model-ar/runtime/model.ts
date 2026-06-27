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
					normalizeObjModelStructure( object );
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

function normalizeObjModelStructure(root: THREE.Object3D): void {

	const splitTargets: THREE.Mesh[] = [];
	root.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh ) {
			if ( isBoundaryPlaneMesh( child ) ) {
				applyBoundaryPlaneMaterial( child );
				return;
			}

			if ( shouldSplitMeshByMaterialGroups( child ) ) {
				splitTargets.push( child );
			}
		}
	} );

	for ( const mesh of splitTargets ) {
		splitMeshByMaterialGroups( mesh );
	}

}

function isBoundaryPlaneMesh(mesh: THREE.Mesh): boolean {

	return mesh.name.trim().toLowerCase() === 'plane';

}

function applyBoundaryPlaneMaterial(mesh: THREE.Mesh): void {

	const highlightMaterial = new THREE.MeshBasicMaterial( {
		name: '__boundary-plane-highlight',
		color: 0x55d7ff,
		transparent: true,
		opacity: 0.18,
		depthWrite: false,
		side: THREE.DoubleSide,
		toneMapped: false
	} );

	mesh.material = highlightMaterial;
	mesh.renderOrder = 10;
	mesh.userData.__nonSelectableHelper = true;
	mesh.userData.__excludeFromLayerIndex = true;

	const parent = mesh.parent;
	if ( parent !== null && parent.name.trim().toLowerCase() === 'plane' ) {
		parent.userData.__nonSelectableHelper = true;
		parent.userData.__excludeFromLayerIndex = true;
	}

}

function shouldSplitMeshByMaterialGroups(mesh: THREE.Mesh): boolean {

	return Array.isArray( mesh.material )
		&& mesh.material.length > 1
		&& mesh.geometry.groups.length > 1;

}

function splitMeshByMaterialGroups(mesh: THREE.Mesh): void {

	if ( mesh.parent === null || Array.isArray( mesh.material ) === false ) {
		return;
	}

	const materialGroups = new Map<number, THREE.BufferGeometry['groups']>();
	for ( const group of mesh.geometry.groups ) {
		const entries = materialGroups.get( group.materialIndex ) ?? [];
		entries.push( {
			start: group.start,
			count: group.count,
			materialIndex: 0
		} );
		materialGroups.set( group.materialIndex, entries );
	}

	if ( materialGroups.size <= 1 ) {
		return;
	}

	const replacementRoot = new THREE.Group();
	replacementRoot.name = mesh.name;
	replacementRoot.position.copy( mesh.position );
	replacementRoot.quaternion.copy( mesh.quaternion );
	replacementRoot.scale.copy( mesh.scale );
	replacementRoot.visible = mesh.visible;
	replacementRoot.castShadow = mesh.castShadow;
	replacementRoot.receiveShadow = mesh.receiveShadow;

	for ( const [ materialIndex, groups ] of materialGroups ) {
		const material = mesh.material[ materialIndex ];
		if ( material === undefined ) {
			continue;
		}

		const mergedGeometry = extractGeometryForMaterialGroups( mesh.geometry, groups );
		if ( mergedGeometry === null ) {
			continue;
		}

		const componentGeometries = splitGeometryIntoConnectedComponents( mergedGeometry );
		for ( let componentIndex = 0; componentIndex < componentGeometries.length; componentIndex ++ ) {
			const layerName = createSplitLayerName( mesh.name, material, materialIndex );
			const componentName = componentGeometries.length === 1
				? layerName
				: `${layerName}__part_${String( componentIndex + 1 ).padStart( 2, '0' )}`;
			const layerId = componentName;
			const isSelectableLayer = shouldTreatAsSelectableLayer( componentGeometries[ componentIndex ] );
			const layerRoot = new THREE.Group();
			layerRoot.name = componentName;
			layerRoot.visible = mesh.visible;
			layerRoot.userData = {
				...mesh.userData,
				__layerId: layerId,
				__businessName: layerName,
				__layerSelectable: isSelectableLayer,
				__excludeFromLayerIndex: isSelectableLayer === false
			};

			const childMaterial = cloneMaterialWithTextures( material );
			const childMesh = new THREE.Mesh( componentGeometries[ componentIndex ], childMaterial );
			childMesh.name = '';
			childMesh.visible = mesh.visible;
			childMesh.castShadow = mesh.castShadow;
			childMesh.receiveShadow = mesh.receiveShadow;
			childMesh.userData = {
				...mesh.userData,
				__layerId: layerId,
				__businessName: layerName,
				__excludeFromLayerIndex: isSelectableLayer === false
			};
			layerRoot.add( childMesh );

			replacementRoot.add( layerRoot );
		}
	}

	if ( replacementRoot.children.length === 0 ) {
		return;
	}

	replacementRoot.userData = { ...mesh.userData };

	const parent = mesh.parent;
	parent.add( replacementRoot );
	parent.remove( mesh );

}

function shouldTreatAsSelectableLayer(geometry: THREE.BufferGeometry): boolean {

	geometry.computeBoundingBox();
	const bounds = geometry.boundingBox;
	if ( bounds === null ) {
		return true;
	}

	const height = bounds.max.y - bounds.min.y;
	const triangleCount = geometry.getIndex()?.count !== undefined
		? geometry.getIndex()!.count / 3
		: geometry.getAttribute( 'position' ).count / 3;

	// Ignore the degenerate flat cap/base patch; users treat the terrain shell as 8 layers.
	if ( height <= 1e-5 && triangleCount <= 2 ) {
		return false;
	}

	return true;

}

function extractGeometryForMaterialGroups(
	sourceGeometry: THREE.BufferGeometry,
	groups: THREE.BufferGeometry['groups']
): THREE.BufferGeometry | null {

	const geometry = sourceGeometry.clone();
	const sourceIndex = sourceGeometry.getIndex();
	const nextIndex: number[] = [];

	for ( const group of groups ) {
		const groupEnd = group.start + group.count;
		for ( let i = group.start; i < groupEnd; i ++ ) {
			nextIndex.push( sourceIndex === null ? i : sourceIndex.getX( i ) );
		}
	}

	if ( nextIndex.length === 0 ) {
		geometry.dispose();
		return null;
	}

	geometry.clearGroups();
	geometry.setIndex( nextIndex );
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();

	return geometry;

}

function splitGeometryIntoConnectedComponents(sourceGeometry: THREE.BufferGeometry): THREE.BufferGeometry[] {

	const sourceIndex = sourceGeometry.getIndex();
	const positionAttribute = sourceGeometry.getAttribute( 'position' );
	if ( sourceIndex === null || positionAttribute === undefined ) {
		return [ sourceGeometry ];
	}

	if ( sourceIndex.count % 3 !== 0 ) {
		return [ sourceGeometry ];
	}

	const triangleCount = sourceIndex.count / 3;
	const edgeToTriangles = new Map<string, number[]>();
	const triangleEdges: string[][] = Array.from( { length: triangleCount }, () => [] );
	const positionKeyCache = new Map<number, string>();

	for ( let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex ++ ) {
		const triangleStart = triangleIndex * 3;
		const vertexIndices = [
			sourceIndex.getX( triangleStart ),
			sourceIndex.getX( triangleStart + 1 ),
			sourceIndex.getX( triangleStart + 2 )
		];
		const positionKeys = vertexIndices.map( ( vertexIndex ) => {
			const cachedKey = positionKeyCache.get( vertexIndex );
			if ( cachedKey !== undefined ) {
				return cachedKey;
			}

			const key = createPositionKey( positionAttribute, vertexIndex );
			positionKeyCache.set( vertexIndex, key );
			return key;
		} );

		const edgeKeys = [
			createEdgeKey( positionKeys[ 0 ], positionKeys[ 1 ] ),
			createEdgeKey( positionKeys[ 1 ], positionKeys[ 2 ] ),
			createEdgeKey( positionKeys[ 2 ], positionKeys[ 0 ] )
		];
		triangleEdges[ triangleIndex ] = edgeKeys;

		for ( const edgeKey of edgeKeys ) {
			const connectedTriangles = edgeToTriangles.get( edgeKey ) ?? [];
			connectedTriangles.push( triangleIndex );
			edgeToTriangles.set( edgeKey, connectedTriangles );
		}
	}

	const visitedTriangles = new Uint8Array( triangleCount );
	const components: number[][] = [];

	for ( let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex ++ ) {
		if ( visitedTriangles[ triangleIndex ] === 1 ) {
			continue;
		}

		const queue = [ triangleIndex ];
		visitedTriangles[ triangleIndex ] = 1;
		const component: number[] = [];

		while ( queue.length > 0 ) {
			const currentTriangle = queue.pop();
			if ( currentTriangle === undefined ) {
				continue;
			}

			component.push( currentTriangle );
			const edges = triangleEdges[ currentTriangle ];

			for ( const edgeKey of edges ) {
				const neighbors = edgeToTriangles.get( edgeKey );
				if ( neighbors === undefined ) {
					continue;
				}

				for ( const neighborTriangle of neighbors ) {
					if ( visitedTriangles[ neighborTriangle ] === 1 ) {
						continue;
					}

					visitedTriangles[ neighborTriangle ] = 1;
					queue.push( neighborTriangle );
				}
			}
		}

		components.push( component );
	}

	if ( components.length <= 1 ) {
		return [ sourceGeometry ];
	}

	const componentGeometries: THREE.BufferGeometry[] = [];
	for ( const component of components ) {
		const componentGeometry = sourceGeometry.clone();
		const componentIndices: number[] = [];

		for ( const triangleIndex of component ) {
			const triangleStart = triangleIndex * 3;
			componentIndices.push(
				sourceIndex.getX( triangleStart ),
				sourceIndex.getX( triangleStart + 1 ),
				sourceIndex.getX( triangleStart + 2 )
			);
		}

		componentGeometry.clearGroups();
		componentGeometry.setIndex( componentIndices );
		componentGeometry.computeBoundingBox();
		componentGeometry.computeBoundingSphere();
		componentGeometries.push( componentGeometry );
	}

	sourceGeometry.dispose();
	return componentGeometries;

}

function createPositionKey(positionAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number): string {

	return [
		positionAttribute.getX( index ).toFixed( 6 ),
		positionAttribute.getY( index ).toFixed( 6 ),
		positionAttribute.getZ( index ).toFixed( 6 )
	].join( '|' );

}

function createEdgeKey(a: string, b: string): string {

	return a < b ? `${a}>>${b}` : `${b}>>${a}`;

}

function createSplitLayerName(
	baseName: string,
	material: THREE.Material,
	materialIndex: number
): string {

	const materialName = material.name.trim();
	if ( materialName.length > 0 ) {
		return `${baseName}__${materialName}`;
	}

	return `${baseName}__material_${String( materialIndex ).padStart( 2, '0' )}`;

}

function cloneMaterialWithTextures(material: THREE.Material): THREE.Material {

	const clonedMaterial = material.clone();

	for ( const textureKey of TEXTURE_PROPERTY_KEYS ) {
		const sourceTexture = clonedMaterial[ textureKey ];
		if ( sourceTexture instanceof THREE.Texture ) {
			clonedMaterial[ textureKey ] = sourceTexture.clone();
		}
	}

	clonedMaterial.needsUpdate = true;
	return clonedMaterial;

}

const TEXTURE_PROPERTY_KEYS = [
	'map',
	'alphaMap',
	'aoMap',
	'bumpMap',
	'displacementMap',
	'emissiveMap',
	'envMap',
	'lightMap',
	'metalnessMap',
	'normalMap',
	'roughnessMap',
	'specularMap'
] as const;

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
