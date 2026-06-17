import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface SceneBundle {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	renderer: THREE.WebGLRenderer;
	controls: OrbitControls;
}

export function createScene(canvasContainer: HTMLElement): SceneBundle {

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x1b1f27 );

	const camera = new THREE.PerspectiveCamera( 50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000 );
	camera.position.set( 3, 2, 5 );

	const renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( canvasContainer.clientWidth, canvasContainer.clientHeight );
	canvasContainer.appendChild( renderer.domElement );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.target.set( 0, 0.8, 0 );

	const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x445566, 2.2 );
	scene.add( hemiLight );

	const dirLight = new THREE.DirectionalLight( 0xffffff, 2.2 );
	dirLight.position.set( 5, 8, 4 );
	scene.add( dirLight );

	const grid = new THREE.GridHelper( 10, 20, 0x4d637c, 0x2b3442 );
	scene.add( grid );

	const axes = new THREE.AxesHelper( 1.5 );
	scene.add( axes );

	return { scene, camera, renderer, controls };

}

export function fitCameraToObject(
	object: THREE.Object3D,
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls
): void {

	const box = new THREE.Box3().setFromObject( object );
	const size = new THREE.Vector3();
	const center = new THREE.Vector3();
	box.getSize( size );
	box.getCenter( center );

	const maxDim = Math.max( size.x, size.y, size.z );
	const fov = camera.fov * ( Math.PI / 180 );
	let cameraZ = Math.abs( maxDim / 2 / Math.tan( fov / 2 ) );
	cameraZ *= 1.7;

	camera.position.set( center.x + cameraZ * 0.6, center.y + cameraZ * 0.35, center.z + cameraZ );
	camera.near = Math.max( maxDim / 100, 0.01 );
	camera.far = Math.max( maxDim * 20, 100 );
	camera.updateProjectionMatrix();

	controls.target.copy( center );
	controls.update();

}

export function resizeScene(
	canvasContainer: HTMLElement,
	camera: THREE.PerspectiveCamera,
	renderer: THREE.WebGLRenderer
): void {

	camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( canvasContainer.clientWidth, canvasContainer.clientHeight );

}
