import type * as THREE from 'three';
import type { ARDomElements, ARSceneBundle } from '../../ui/types.js';

interface CreateDesktopRuntimeOptions {
	dom: Pick<ARDomElements, 'canvasContainer' | 'desktopCanvasContainer'>;
	sceneBundle: ARSceneBundle;
	desktopAxesHelper: THREE.AxesHelper;
	isDesktopLayout(): boolean;
	resizeScene(
		camera: ARSceneBundle[ 'camera' ],
		renderer: ARSceneBundle[ 'renderer' ],
		container: HTMLElement | null
	): void;
	updateDesktopInteractionState(): void;
	onEnterDesktopLayout(): void;
	onAfterDesktopLayoutChange(): void;
}

export interface DesktopRuntime {
	syncCanvasHost(): void;
	updateSceneDecorations(): void;
	handleLayoutChange(): void;
	handleWindowResize(): void;
}

export function createDesktopRuntime(options: CreateDesktopRuntimeOptions): DesktopRuntime {

	const {
		dom,
		sceneBundle,
		desktopAxesHelper,
		isDesktopLayout,
		resizeScene,
		updateDesktopInteractionState,
		onEnterDesktopLayout,
		onAfterDesktopLayoutChange
	} = options;

	let desktopAxesAttached = false;

	function updateSceneDecorations(): void {

		if ( isDesktopLayout() && desktopAxesAttached === false ) {
			sceneBundle.scene.add( desktopAxesHelper );
			desktopAxesAttached = true;
			return;
		}

		if ( isDesktopLayout() === false && desktopAxesAttached ) {
			sceneBundle.scene.remove( desktopAxesHelper );
			desktopAxesAttached = false;
		}

	}

	function syncCanvasHost(): void {

		const targetHost = isDesktopLayout() ? dom.desktopCanvasContainer : dom.canvasContainer;
		if ( sceneBundle.renderer.domElement.parentElement !== targetHost ) {
			targetHost.appendChild( sceneBundle.renderer.domElement );
		}

		updateDesktopInteractionState();
		resizeScene( sceneBundle.camera, sceneBundle.renderer, targetHost );

	}

	return {
		syncCanvasHost,
		updateSceneDecorations,

		handleLayoutChange() {

			syncCanvasHost();
			updateSceneDecorations();
			if ( isDesktopLayout() ) {
				onEnterDesktopLayout();
			}
			onAfterDesktopLayoutChange();

		},

		handleWindowResize() {

			resizeScene(
				sceneBundle.camera,
				sceneBundle.renderer,
				sceneBundle.renderer.domElement.parentElement
			);
			updateSceneDecorations();

		}
	};

}
