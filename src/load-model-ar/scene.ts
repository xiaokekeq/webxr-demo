import * as THREE from 'three';
import type { ARSceneBundle } from './types.js';

export function createARScene(canvasContainer: HTMLElement): ARSceneBundle {

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.01, 30 );

	const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.xr.enabled = true;
	canvasContainer.appendChild( renderer.domElement );

	const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x7a8ba8, 2.2 );
	scene.add( hemiLight );

	const dirLight = new THREE.DirectionalLight( 0xffffff, 1.6 );
	dirLight.position.set( 3, 6, 2 );
	scene.add( dirLight );

	const reticle = createReticle();
	scene.add( reticle );

	const modelAnchor = new THREE.Group();
	scene.add( modelAnchor );

	return { scene, camera, renderer, reticle, modelAnchor };

}

export function resizeARScene(
	camera: THREE.PerspectiveCamera,
	renderer: THREE.WebGLRenderer
): void {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

}

function createReticle(): THREE.Group {

	const group = new THREE.Group();

	const ring = new THREE.Mesh(
		new THREE.RingGeometry( 0.08, 0.11, 40 ),
		new THREE.MeshBasicMaterial( { color: 0x4ea2ff, opacity: 0.9, transparent: true } )
	);
	ring.rotation.x = - Math.PI / 2;
	group.add( ring );

	const dot = new THREE.Mesh(
		new THREE.CircleGeometry( 0.018, 24 ),
		new THREE.MeshBasicMaterial( { color: 0xeaf4ff } )
	);
	dot.rotation.x = - Math.PI / 2;
	group.add( dot );

	group.matrixAutoUpdate = false;
	group.visible = false;

	return group;

}
