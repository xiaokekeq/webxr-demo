import type * as THREE from 'three';
import type { AppMode } from '../../../registration/registration-store.js';
import type { ARSceneBundle } from '../../../shared/types.js';

export interface SceneHostRuntimeHosts {
	arCanvasHost: HTMLElement;
	preArCanvasHost: HTMLElement;
	desktopCanvasHost: HTMLElement;
	xrButtonHost: HTMLElement;
}

interface CreateSceneHostRuntimeOptions {
	sceneBundle: ARSceneBundle;
	desktopAxesHelper: THREE.Object3D;
	resizeScene(
		camera: THREE.PerspectiveCamera,
		renderer: THREE.WebGLRenderer,
		host: HTMLElement | null
	): void;
	updateDesktopInteractionState(isDesktopLayout: boolean, isPresenting: boolean): void;
}

export interface SceneHostRuntime {
	mount(hosts: SceneHostRuntimeHosts, xrButtonWrap: HTMLElement): void;
	sync(args: { isDesktopLayout: boolean; appMode: AppMode }): void;
	resize(): void;
}

export function createSceneHostRuntime(
	options: CreateSceneHostRuntimeOptions
): SceneHostRuntime {

	const {
		sceneBundle,
		desktopAxesHelper,
		resizeScene,
		updateDesktopInteractionState
	} = options;

	let hosts: SceneHostRuntimeHosts | null = null;
	let currentAppMode: AppMode = 'pre-ar';
	let currentIsDesktopLayout = false;

	return {
		mount(nextHosts, xrButtonWrap) {

			hosts = nextHosts;
			if ( xrButtonWrap.parentElement !== nextHosts.xrButtonHost ) {
				nextHosts.xrButtonHost.appendChild( xrButtonWrap );
			}

		},

		sync(args) {

			currentAppMode = args.appMode;
			currentIsDesktopLayout = args.isDesktopLayout;
			if ( hosts === null ) {
				return;
			}

			const targetHost = currentIsDesktopLayout
				? hosts.desktopCanvasHost
				: currentAppMode === 'pre-ar'
					? hosts.preArCanvasHost
					: hosts.arCanvasHost;

			if ( sceneBundle.renderer.domElement.parentElement !== targetHost ) {
				targetHost.appendChild( sceneBundle.renderer.domElement );
			}

			if ( currentIsDesktopLayout ) {
				sceneBundle.scene.add( desktopAxesHelper );
			} else {
				sceneBundle.scene.remove( desktopAxesHelper );
			}

			updateDesktopInteractionState(
				currentIsDesktopLayout || currentAppMode === 'pre-ar',
				sceneBundle.renderer.xr.isPresenting
			);

			resizeScene( sceneBundle.camera, sceneBundle.renderer, targetHost );
			sceneBundle.renderer.render( sceneBundle.scene, sceneBundle.camera );

		},

		resize() {

			const host = sceneBundle.renderer.domElement.parentElement;
			resizeScene( sceneBundle.camera, sceneBundle.renderer, host );
			sceneBundle.renderer.render( sceneBundle.scene, sceneBundle.camera );

		}
	};

}
