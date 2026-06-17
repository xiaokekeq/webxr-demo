import type { PipeRecord } from './types.js';

export async function loadBusinessData(url: string, statusEl: HTMLElement): Promise<Map<string, PipeRecord>> {

	statusEl.textContent = '正在加载业务数据...';

	try {

		const response = await fetch( url );
		if ( response.ok === false ) {
			throw new Error( `HTTP ${response.status}` );
		}

		const data = await response.json();
		const pipes = Array.isArray( data ) ? data : data.pipes;
		if ( Array.isArray( pipes ) === false ) {
			throw new Error( 'pipes.json 格式不正确，预期为数组或 { "pipes": [] }' );
		}

		statusEl.textContent = `业务数据加载成功，共 ${pipes.length} 条`;
		return new Map( pipes.map( ( item: PipeRecord ) => [ item.name, item ] ) );

	} catch ( error ) {

		console.error( 'pipes.json load failed:', error );
		statusEl.textContent = '业务数据加载失败，属性查询将不可用';
		return new Map();

	}

}
