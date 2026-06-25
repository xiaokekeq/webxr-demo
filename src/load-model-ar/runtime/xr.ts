import type { ARSceneBundle, SetStatus, XRHitTestController } from '../shared/types.js';
import {
	createXRHitTestController,
	detectImmersiveArSupport,
	type ImmersiveArSupportInfo
} from './xr-support.js';

interface CreateXRSessionRuntimeOptions {
	sceneBundle: ARSceneBundle;
	xrButtonWrap: HTMLElement;
	setStatus: SetStatus;
	onSessionStart(): void;
	onSessionEnd(): void;
	canReportStatus(): boolean;
	onAttemptCoarsePlacement(): void;
	onFrameUpdate(): void;
}

export interface XRSessionRuntime {
	setup(): void;
	detectSupport(): Promise<ImmersiveArSupportInfo>;
	requestSession(): void;
	renderFrame(time: number, frame?: XRFrame): void;
	getHitTestController(): XRHitTestController;
}

export function createXRSessionRuntime(options: CreateXRSessionRuntimeOptions): XRSessionRuntime {

	const {
		sceneBundle,
		xrButtonWrap,
		setStatus,
		onSessionStart,
		onSessionEnd,
		canReportStatus,
		onAttemptCoarsePlacement,
		onFrameUpdate
	} = options;

	const xrHitTest = createXRHitTestController( {
		renderer: sceneBundle.renderer,
		reticle: sceneBundle.reticle,
		xrButtonWrap,
		setStatus,
		onSessionStart,
		onSessionEnd,
		canReportStatus
	} );

	return {
		setup() {

			xrHitTest.setup();

		},

		detectSupport() {

			return detectImmersiveArSupport();

		},

		requestSession() {

			xrHitTest.requestSession();

		},

		renderFrame(_: number, frame?: XRFrame) {

			if ( sceneBundle.renderer.xr.isPresenting && frame ) {
				xrHitTest.update( frame );
				onAttemptCoarsePlacement();
				onFrameUpdate();
			}

			if ( sceneBundle.controls.enabled && sceneBundle.renderer.xr.isPresenting === false ) {
				sceneBundle.controls.update();
			}

			sceneBundle.renderer.render( sceneBundle.scene, sceneBundle.camera );

		},

		getHitTestController() {

			return xrHitTest;

		}
	};

}

