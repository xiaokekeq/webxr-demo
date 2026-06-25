import type * as THREE from 'three';
import type { DemoModelConfig } from '../../../data/demo-model-config.js';
import type { EngineeringRegistrationSolution } from '../../../registration/engineering-registration.js';
import { createRegistrationSnapshot } from './view-state.js';

export interface RuntimeExportResult {
	ok: boolean;
	statusMessage: string;
}

interface ExportRegistrationSnapshotOptions {
	appMode: 'pre-ar' | 'ar-session';
	isPresenting: boolean;
	demoModelConfig: DemoModelConfig | null;
	registrationSolution: EngineeringRegistrationSolution | null;
	currentStage: string;
	manualReadout: unknown;
	placedModel: THREE.Group | null;
}

export function exportSceneSnapshot(options: {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.Camera;
	modelId: string | null;
}): RuntimeExportResult {

	try {
		options.renderer.render( options.scene, options.camera );
		const canvas = options.renderer.domElement;
		const timestamp = createSnapshotTimestamp();
		const fileBaseName = options.modelId || 'ar-scene';
		const fileName = `${fileBaseName}-${timestamp}.png`;

		const dataUrl = canvas.toDataURL( 'image/png' );
		triggerFileDownload( dataUrl, fileName );
		return {
			ok: true,
			statusMessage: `截图已导出：${fileName}`
		};
	} catch ( error ) {
		console.error( 'Snapshot export failed:', error );
		return {
			ok: false,
			statusMessage: '截图失败，当前环境可能限制了画面导出。'
		};
	}

}

export function exportRegistrationSnapshotFile(
	options: ExportRegistrationSnapshotOptions
): RuntimeExportResult {

	if ( options.isPresenting || options.appMode === 'ar-session' ) {
		return {
			ok: false,
			statusMessage: 'AR 运行中不提供配准 JSON 导出，请退出 AR 后再操作。'
		};
	}

	if ( options.demoModelConfig === null || options.registrationSolution === null ) {
		return {
			ok: false,
			statusMessage: '当前没有可导出的配准快照。'
		};
	}

	const snapshot = createRegistrationSnapshot( {
		demoModelConfig: options.demoModelConfig,
		registrationSolution: options.registrationSolution,
		currentStage: options.currentStage,
		manualReadout: options.manualReadout,
		placedModel: options.placedModel
	} );

	const blob = new Blob( [ JSON.stringify( snapshot, null, 2 ) ], { type: 'application/json' } );
	const url = URL.createObjectURL( blob );
	triggerFileDownload( url, `${options.demoModelConfig.modelId}-registration.json` );
	window.setTimeout( () => {
		URL.revokeObjectURL( url );
	}, 1000 );

	return {
		ok: true,
		statusMessage: '已导出配准 JSON 快照。'
	};

}

function createSnapshotTimestamp(): string {

	const now = new Date();
	const pad = (value: number): string => String( value ).padStart( 2, '0' );
	return [
		now.getFullYear(),
		pad( now.getMonth() + 1 ),
		pad( now.getDate() )
	].join( '' ) + '-' + [
		pad( now.getHours() ),
		pad( now.getMinutes() ),
		pad( now.getSeconds() )
	].join( '' );

}

function triggerFileDownload(url: string, filename: string): void {

	const link = document.createElement( 'a' );
	link.href = url;
	link.download = filename;
	link.rel = 'noopener';
	link.style.display = 'none';
	document.body.appendChild( link );
	link.click();
	window.setTimeout( () => {
		link.remove();
	}, 0 );

}
