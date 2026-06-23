import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import type { SetStatus, XRHitTestController } from '../ui/types.js';

interface CreateXRHitTestControllerOptions {
	renderer: THREE.WebGLRenderer;
	reticle: THREE.Group;
	xrButtonWrap: HTMLElement;
	setStatus: SetStatus;
	onSessionStart?: () => void;
	onSessionEnd?: () => void;
	onSelect?: () => void;
	canReportStatus?: () => boolean;
}

const reticlePosition = new THREE.Vector3();
const RETICLE_PERSIST_MS = 350;
const PLACEABLE_HIT_RETENTION_MS = 1600;

export interface ImmersiveArSupportInfo {
	supported: boolean;
	message: string;
}

export async function detectImmersiveArSupport(): Promise<ImmersiveArSupportInfo> {

	if ( 'xr' in navigator === false || navigator.xr === undefined ) {
		return {
			supported: false,
			message: '当前设备不支持 AR。可查看模型和数据，但不能进行现场 AR 核查。请使用支持 WebXR AR 的移动设备打开。'
		};
	}

	try {
		const supported = await navigator.xr.isSessionSupported( 'immersive-ar' );
		return supported
			? {
				supported: true,
				message: '当前设备支持 AR。完成模型和阶段确认后，可点击“进入 AR”开始现场核查。'
			}
			: {
				supported: false,
				message: '当前设备不支持 AR。可查看模型和数据，但不能进行现场 AR 核查。请使用支持 WebXR AR 的移动设备打开。'
			};
	} catch {
		return {
			supported: false,
			message: 'AR 能力检测失败。可查看模型和数据，但当前无法启动现场 AR 核查。'
		};
	}

}

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
		onSelect,
		canReportStatus
	} = options;

	let hitTestSource: XRHitTestSource | null = null;
	let hitTestSourceRequested = false;
	let lastSuccessfulHitTime = 0;
	let lastStableHitPosition: THREE.Vector3 | null = null;
	let launchElement: HTMLElement | null = null;

	function setup(): void {

		launchElement = ARButton.createButton( renderer, {
			requiredFeatures: [ 'hit-test' ],
			optionalFeatures: [ 'dom-overlay' ],
			domOverlay: { root: document.body }
		} );

		xrButtonWrap.appendChild( launchElement );

		renderer.xr.addEventListener( 'sessionstart', handleSessionStart );
		renderer.xr.addEventListener( 'sessionend', handleSessionEnd );

	}

	async function handleSessionStart(): Promise<void> {

		onSessionStart?.();
		reticle.visible = false;
		lastSuccessfulHitTime = 0;
		lastStableHitPosition = null;
		setStatus( '已进入 AR，请缓慢移动手机，让系统持续识别地面或墙面。' );

		const session = renderer.xr.getSession();
		if ( session === null ) {
			return;
		}

		session.addEventListener( 'select', handleSelect );

		const viewerSpace = await session.requestReferenceSpace( 'viewer' );
		const requestHitTestSource = session.requestHitTestSource;

		if ( requestHitTestSource === undefined ) {
			setStatus( '当前设备不支持 hit-test，无法识别现实平面。' );
			return;
		}

		hitTestSource = await createBestEffortHitTestSource( session, viewerSpace );

		if ( hitTestSource === null ) {
			setStatus( '未能创建 hit-test 数据源，无法识别地面或墙面。' );
			return;
		}

		hitTestSourceRequested = true;

	}

	function handleSessionEnd(): void {

		renderer.xr.getSession()?.removeEventListener( 'select', handleSelect );

		reticle.visible = false;
		hitTestSource = null;
		hitTestSourceRequested = false;
		lastSuccessfulHitTime = 0;
		lastStableHitPosition = null;
		onSessionEnd?.();
		setStatus( 'AR 会话已结束，可以再次点击 Enter AR 重新开始。' );

	}

	function handleSelect(): void {

		onSelect?.();

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
			handleMissingHit();
			return;
		}

		const firstHit = hitTestResults[ 0 ];
		const pose = firstHit?.getPose( referenceSpace );
		if ( pose === undefined || pose === null ) {
			handleMissingHit();
			return;
		}

		lastSuccessfulHitTime = performance.now();
		reticle.visible = true;
		reticle.matrix.fromArray( pose.transform.matrix );
		reticlePosition.setFromMatrixPosition( reticle.matrix );
		lastStableHitPosition = reticlePosition.clone();

		if ( canReportStatus?.() !== false ) {
			setStatus( '已找到可用平面，可继续观察地面或墙面上的命中效果。' );
		}

	}

	function handleMissingHit(): void {

		const elapsed = performance.now() - lastSuccessfulHitTime;
		if ( reticle.visible && elapsed < RETICLE_PERSIST_MS ) {
			return;
		}

		reticle.visible = false;
		if ( canReportStatus?.() !== false ) {
			setStatus( '当前未命中平面，请缓慢移动手机并保持墙面或地面在视野中。' );
		}

	}

	function hasGroundHit(): boolean {

		if ( renderer.xr.isPresenting === false ) {
			return false;
		}

		if ( reticle.visible ) {
			return true;
		}

		return lastStableHitPosition !== null
			&& performance.now() - lastSuccessfulHitTime <= PLACEABLE_HIT_RETENTION_MS;

	}

	function getHitPosition(target: THREE.Vector3): THREE.Vector3 | null {

		if ( hasGroundHit() === false ) {
			return null;
		}

		if ( reticle.visible ) {
			reticlePosition.setFromMatrixPosition( reticle.matrix );
			target.copy( reticlePosition );
			return target;
		}

		if ( lastStableHitPosition === null ) {
			return null;
		}

		target.copy( lastStableHitPosition );
		return target;

	}

	return {
		setup,
		update,
		hasGroundHit,
		getHitPosition,
		requestSession() {

			launchElement?.click();

		}
	};

}

async function createBestEffortHitTestSource(
	session: XRSession,
	viewerSpace: XRReferenceSpace
): Promise<XRHitTestSource | null> {

	const requestHitTestSource = session.requestHitTestSource;
	if ( requestHitTestSource === undefined ) {
		return null;
	}

	const optionVariants: Array<Record<string, unknown>> = [
		{ space: viewerSpace, entityTypes: [ 'plane', 'mesh', 'point' ] },
		{ space: viewerSpace, entityTypes: [ 'plane', 'point' ] },
		{ space: viewerSpace, entityTypes: [ 'plane' ] },
		{ space: viewerSpace }
	];

	for ( const options of optionVariants ) {
		try {
			const source = await requestHitTestSource.call( session, options as unknown as XRHitTestOptionsInit );
			if ( source !== undefined && source !== null ) {
				return source;
			}
		} catch {
			// Try the next less-demanding option set.
		}
	}

	return null;

}
