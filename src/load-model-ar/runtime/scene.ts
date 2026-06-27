import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ARSceneBundle } from '../shared/types.js';

export function createARScene(canvasContainer: HTMLElement): ARSceneBundle {

	const scene = new THREE.Scene();
	const initialSize = getHostSize( canvasContainer );
	const camera = new THREE.PerspectiveCamera( 70, initialSize.width / initialSize.height, 0.01, 2000 );

	const renderer = new THREE.WebGLRenderer( {
		antialias: true,
		alpha: true,
		// Keep the drawing buffer so snapshot export can read the current frame.
		preserveDrawingBuffer: true
	} );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( initialSize.width, initialSize.height, false );
	renderer.setClearColor( 0x000000, 0 );
	renderer.setClearAlpha( 0 );
	renderer.xr.enabled = true;
	renderer.domElement.style.backgroundColor = 'transparent';
	canvasContainer.appendChild( renderer.domElement );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.enablePan = true;
	controls.rotateSpeed = 0.85;
	controls.zoomSpeed = 0.9;
	controls.panSpeed = 0.8;
	controls.enabled = false;

	const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x7a8ba8, 2.2 );
	scene.add( hemiLight );

	const dirLight = new THREE.DirectionalLight( 0xffffff, 1.6 );
	dirLight.position.set( 3, 6, 2 );
	scene.add( dirLight );

	const reticle = createReticle();
	scene.add( reticle );

	const previewModelAnchor = new THREE.Group();
	previewModelAnchor.name = '__preview-model-anchor';
	scene.add( previewModelAnchor );

	const arModelAnchor = new THREE.Group();
	arModelAnchor.name = '__ar-model-anchor';
	scene.add( arModelAnchor );

	return { scene, camera, renderer, controls, reticle, previewModelAnchor, arModelAnchor };

}

export function resizeARScene(
	camera: THREE.PerspectiveCamera,
	renderer: THREE.WebGLRenderer,
	hostElement = renderer.domElement.parentElement
): void {

	const size = getHostSize( hostElement );
	camera.aspect = size.width / size.height;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( size.width, size.height, false );

}

function getHostSize(hostElement: Element | null): { width: number; height: number } {

	const rect = hostElement?.getBoundingClientRect();
	const width = Math.max( 1, Math.round( rect?.width || window.innerWidth ) );
	const height = Math.max( 1, Math.round( rect?.height || window.innerHeight ) );

	return { width, height };

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

