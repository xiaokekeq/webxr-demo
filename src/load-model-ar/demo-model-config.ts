import type { AbsoluteSiteTarget } from './coarse-registration-config.js';
import type { SetStatus } from './types.js';

export interface DemoModelControlPoint {
	x: number;
	y: number;
	z: number;
}

export interface DemoModelConfig {
	modelId: string;
	anchor: {
		lat: number;
		lon: number;
		alt: number;
	};
	yaw: number;
	scale: number;
	controlPoints: Record<string, DemoModelControlPoint>;
}

export async function loadDemoModelConfig(
	url: string,
	setStatus: SetStatus
): Promise<DemoModelConfig> {

	setStatus( '正在加载模型配置...' );

	const response = await fetch( url );
	if ( response.ok === false ) {
		throw new Error( `模型配置加载失败：HTTP ${response.status}` );
	}

	const data = await response.json() as DemoModelConfig;
	validateDemoModelConfig( data );

	console.info( '[Demo Model Config]', data );

	return data;

}

export function createCoarseTargetFromModelConfig(config: DemoModelConfig): AbsoluteSiteTarget {

	return {
		mode: 'absolute-site',
		label: config.modelId,
		latitude: config.anchor.lat,
		longitude: config.anchor.lon,
		targetHeadingDeg: config.yaw,
		assetYawOffsetDeg: 0
	};

}

function validateDemoModelConfig(config: DemoModelConfig): void {

	if ( typeof config.modelId !== 'string' || config.modelId.length === 0 ) {
		throw new Error( '模型配置缺少有效的 modelId' );
	}

	if ( typeof config.anchor?.lat !== 'number' || typeof config.anchor?.lon !== 'number' ) {
		throw new Error( '模型配置缺少有效的 anchor.lat / anchor.lon' );
	}

	if ( typeof config.yaw !== 'number' ) {
		throw new Error( '模型配置缺少有效的 yaw' );
	}

	if ( typeof config.scale !== 'number' || Number.isFinite( config.scale ) === false || config.scale <= 0 ) {
		throw new Error( '模型配置缺少有效的 scale' );
	}

	if ( typeof config.controlPoints !== 'object' || config.controlPoints === null ) {
		throw new Error( '模型配置缺少有效的 controlPoints' );
	}

}
