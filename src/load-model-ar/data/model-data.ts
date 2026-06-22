import type { PipeRecord } from '../../load-model/types.js';

export const PROJECT_NAME = '管网现场核查项目';

export const TIMELINE_STAGES = [
	'开挖前',
	'管沟开挖',
	'管线铺设',
	'回填前核查',
	'回填后'
] as const;

export const STATIC_LAYER_NAMES = [
	'给水管线',
	'雨水管线',
	'污水管线',
	'电力管线',
	'通信管线',
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
