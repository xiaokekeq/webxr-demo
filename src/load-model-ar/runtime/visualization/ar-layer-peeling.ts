import type { ModelLayerState } from '../../registration/registration-store.js';

export interface TerrainLayerItem {
	id: string;
	name: string;
	index: number;
	visible: boolean;
}

export interface ArLayerPeelingApplyResult {
	value: number;
	totalLayerCount: number;
	hiddenLayerCount: number;
	visibleLayerCount: number;
	hiddenLayerIds: string[];
	visibleLayerIds: string[];
}

export interface ArLayerPeelingController {
	getLayers(modelLayers: readonly ModelLayerState[]): TerrainLayerItem[];
	apply(value: number, modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult;
	hideOne(modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult;
	restoreOne(modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult;
	restoreAll(modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult;
	restore(): void;
	dispose(): void;
}

export function createArLayerPeelingController(): ArLayerPeelingController {

	let currentValue = 0;

	function getLayers(modelLayers: readonly ModelLayerState[]): TerrainLayerItem[] {

		return modelLayers.map( ( layer, index ) => ( {
			id: layer.id,
			name: layer.label,
			index: index,
			visible: layer.visible
		} ) );

	}

	function apply(value: number, modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult {

		currentValue = clampPercent( value );
		return buildApplyResult( currentValue, modelLayers );

	}

	function hideOne(modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult {

		const currentHiddenLayerCount = countHiddenLayers( modelLayers );
		const maxHideCount = Math.max( 0, modelLayers.length - 1 );
		const nextHiddenLayerCount = Math.min( maxHideCount, currentHiddenLayerCount + 1 );
		currentValue = toPercent( nextHiddenLayerCount, maxHideCount );
		return buildApplyResult( currentValue, modelLayers );

	}

	function restoreOne(modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult {

		const currentHiddenLayerCount = countHiddenLayers( modelLayers );
		const maxHideCount = Math.max( 0, modelLayers.length - 1 );
		const nextHiddenLayerCount = Math.max( 0, currentHiddenLayerCount - 1 );
		currentValue = toPercent( nextHiddenLayerCount, maxHideCount );
		return buildApplyResult( currentValue, modelLayers );

	}

	function restoreAll(modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult {

		currentValue = 0;
		return buildApplyResult( currentValue, modelLayers );

	}

	function restore(): void {

		currentValue = 0;

	}

	return {
		getLayers,
		apply,
		hideOne,
		restoreOne,
		restoreAll,
		restore,
		dispose: restore
	};

}

function buildApplyResult(value: number, modelLayers: readonly ModelLayerState[]): ArLayerPeelingApplyResult {

	const totalLayerCount = modelLayers.length;
	const maxHideCount = Math.max( 0, totalLayerCount - 1 );
	const hiddenLayerCount = totalLayerCount <= 1
		? 0
		: Math.round( clampPercent( value ) / 100 * maxHideCount );
	const hiddenLayerIds = modelLayers.slice( 0, hiddenLayerCount ).map( ( layer ) => layer.id );
	const visibleLayerIds = modelLayers.slice( hiddenLayerCount ).map( ( layer ) => layer.id );

	return {
		value: clampPercent( value ),
		totalLayerCount,
		hiddenLayerCount,
		visibleLayerCount: visibleLayerIds.length,
		hiddenLayerIds,
		visibleLayerIds
	};

}

function countHiddenLayers(modelLayers: readonly ModelLayerState[]): number {

	return modelLayers.reduce( ( count, layer ) => count + ( layer.visible ? 0 : 1 ), 0 );

}

function toPercent(hiddenLayerCount: number, maxHideCount: number): number {

	if ( maxHideCount <= 0 ) {
		return 0;
	}

	return Math.round( hiddenLayerCount / maxHideCount * 100 );

}

function clampPercent(value: number): number {

	return Math.min( 100, Math.max( 0, Math.round( value ) ) );

}
