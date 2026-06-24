import type { AppMode } from '../../../registration/registration-store.js';
import type { ARDomElements, ARSceneBundle } from '../../../shared/types.js';

interface CreateMobileLayoutRuntimeOptions {
	dom: Pick<ARDomElements, 'canvasContainer' | 'mobilePreArCanvasContainer'>;
	sceneBundle: ARSceneBundle;
	resizeScene(
		camera: ARSceneBundle[ 'camera' ],
		renderer: ARSceneBundle[ 'renderer' ],
		container: HTMLElement | null
	): void;
}

export interface MobileLayoutRuntime {
	syncCanvasHost(appMode: AppMode): void;
	handleWindowResize(): void;
}

export function createMobileLayoutRuntime(
	options: CreateMobileLayoutRuntimeOptions
): MobileLayoutRuntime {

	const { dom, sceneBundle, resizeScene } = options;

	return {
		syncCanvasHost(appMode) {

			const targetHost = appMode === 'pre-ar'
				? dom.mobilePreArCanvasContainer
				: dom.canvasContainer;

			if ( sceneBundle.renderer.domElement.parentElement !== targetHost ) {
				targetHost.appendChild( sceneBundle.renderer.domElement );
			}

			resizeScene( sceneBundle.camera, sceneBundle.renderer, targetHost );

		},

		handleWindowResize() {

			resizeScene(
				sceneBundle.camera,
				sceneBundle.renderer,
				sceneBundle.renderer.domElement.parentElement
			);

		}
	};

}



