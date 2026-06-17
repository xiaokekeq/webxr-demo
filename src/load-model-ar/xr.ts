import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import type { SetStatus, XRHitTestController } from './types.js';

interface CreateXRHitTestControllerOptions {
	renderer: THREE.WebGLRenderer;
	reticle: THREE.Group;
	xrButtonWrap: HTMLElement;
	setStatus: SetStatus;
	onSessionStart?: () => void;
	onSessionEnd?: () => void;
	canReportStatus?: () => boolean;
}

const reticlePosition = new THREE.Vector3();

export function createXRHitTestController(
	options: CreateXRHitTestControllerOptions
): XRHitTestController {

	const {
		renderer,
		reticle,
		xrButtonWrap,
		setStatus,
		onSessionStart,
		onSessionEnd,
		canReportStatus
	} = options;

	let hitTestSource: XRHitTestSource | null = null;
	let hitTestSourceRequested = false;

	function setup(): void {

		const button = ARButton.createButton( renderer, {
			requiredFeatures: [ 'hit-test' ],
			optionalFeatures: [ 'dom-overlay' ],
			domOverlay: { root: document.body }
		} );

		xrButtonWrap.appendChild( button );

		renderer.xr.addEventListener( 'sessionstart', handleSessionStart );
		renderer.xr.addEventListener( 'sessionend', handleSessionEnd );

	}

	async function handleSessionStart(): Promise<void> {

		onSessionStart?.();
		reticle.visible = false;
		setStatus( '进入 AR 成功，请移动手机寻找现实地面' );

		const session = renderer.xr.getSession();
		if ( session === null ) {
			return;
		}

		const viewerSpace = await session.requestReferenceSpace( 'viewer' );
		const requestHitTestSource = session.requestHitTestSource;

		if ( requestHitTestSource === undefined ) {
			setStatus( '当前设备不支持 hit-test，无法识别地面' );
			return;
		}

		hitTestSource = await requestHitTestSource.call( session, { space: viewerSpace } ) ?? null;

		if ( hitTestSource === null ) {
			setStatus( '未能创建 hit-test 数据源，无法识别地面' );
			return;
		}

		hitTestSourceRequested = true;

	}

	function handleSessionEnd(): void {

		reticle.visible = false;
		hitTestSource = null;
		hitTestSourceRequested = false;
		onSessionEnd?.();
		setStatus( 'AR 会话已结束，可再次点击 Enter AR 重新开始' );

	}

	function update(frame: XRFrame): void {

		if ( hitTestSourceRequested === false || hitTestSource === null ) {
			return;
		}

		const referenceSpace = renderer.xr.getReferenceSpace();
		if ( referenceSpace === null ) {
			reticle.visible = false;
			return;
		}

		const hitTestResults = frame.getHitTestResults( hitTestSource );

		if ( hitTestResults.length === 0 ) {
			reticle.visible = false;
			if ( canReportStatus?.() !== false ) {
				setStatus( '继续移动手机，等待识别现实地面...' );
			}
			return;
		}

		const firstHit = hitTestResults[ 0 ];
		const pose = firstHit?.getPose( referenceSpace );
		if ( pose === undefined || pose === null ) {
			reticle.visible = false;
			return;
		}

		reticle.visible = true;
		reticle.matrix.fromArray( pose.transform.matrix );
		if ( canReportStatus?.() !== false ) {
			setStatus( '已找到地面，点击屏幕即可放置模型' );
		}

	}

	function canPlace(): boolean {

		return renderer.xr.isPresenting && reticle.visible;

	}

	function getReticlePosition(target: THREE.Vector3): THREE.Vector3 | null {

		if ( canPlace() === false ) {
			return null;
		}

		reticlePosition.setFromMatrixPosition( reticle.matrix );
		target.copy( reticlePosition );
		return target;

	}

	return {
		setup,
		update,
		canPlace,
		getReticlePosition
	};

}
