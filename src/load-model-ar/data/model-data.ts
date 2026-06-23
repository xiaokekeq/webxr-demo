import type { PipeRecord } from '../../load-model/types.js';

export const PROJECT_NAME = '堤防现场核查项目';

export const TIMELINE_STAGES = [
	'施工前',
	'基础开挖',
	'堤身填筑',
	'护坡施工',
	'完工核查'
] as const;

export const STATIC_LAYER_NAMES = [
	'堤身结构',
	'护坡结构',
	'防渗层',
	'排水设施',
	'监测点',
	'标注信息'
] as const;

export async function loadPipeRecords(pipesUrl: string): Promise<Map<string, PipeRecord>> {

	const response = await fetch( pipesUrl );
	if ( response.ok === false ) {
		throw new Error( `Failed to load pipes.json: HTTP ${response.status}` );
	}

	const data = await response.json();
	const pipes = Array.isArray( data ) ? data : data.pipes;
	if ( Array.isArray( pipes ) === false ) {
		throw new Error( 'pipes.json must be an array or an object with a pipes array.' );
	}

	return new Map( pipes.map( ( item: PipeRecord ) => [ item.name, item ] ) );

}
