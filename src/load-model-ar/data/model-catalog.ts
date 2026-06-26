export interface ModelAssetTransform {
	upAxis?: 'y' | 'z';
	scaleFactor?: number;
	disableAutoScale?: boolean;
}

export interface ModelCatalogItem {
	id: string;
	name: string;
	modelUrl: string;
	materialUrl?: string;
	assetTransform?: ModelAssetTransform;
	configUrl: string;
	pipesUrl: string;
}

const MODEL_CATALOG_URL = '/pipe-viewer/models.json';

export async function fetchModelCatalog(): Promise<ModelCatalogItem[]> {

	const response = await fetch( MODEL_CATALOG_URL );
	if ( response.ok === false ) {
		throw new Error( `Failed to load models.json: HTTP ${response.status}` );
	}

	const data = await response.json();
	if ( Array.isArray( data ) === false ) {
		throw new Error( 'models.json must be an array.' );
	}

	return data.map( normalizeModelCatalogItem );

}

export function findModelCatalogItem(
	items: ModelCatalogItem[],
	modelId: string
): ModelCatalogItem | null {

	return items.find( ( item ) => item.id === modelId ) ?? null;

}

function normalizeModelCatalogItem(item: unknown): ModelCatalogItem {

	if ( typeof item !== 'object' || item === null ) {
		throw new Error( 'Invalid model catalog entry.' );
	}

	const candidate = item as Partial<ModelCatalogItem>;
	if (
		typeof candidate.id !== 'string'
		|| typeof candidate.name !== 'string'
		|| typeof candidate.modelUrl !== 'string'
		|| typeof candidate.configUrl !== 'string'
		|| typeof candidate.pipesUrl !== 'string'
	) {
		throw new Error( 'Model catalog entry is missing required fields.' );
	}

	return {
		id: candidate.id,
		name: candidate.name,
		modelUrl: candidate.modelUrl,
		materialUrl: typeof candidate.materialUrl === 'string' ? candidate.materialUrl : undefined,
		assetTransform: normalizeAssetTransform( candidate.assetTransform ),
		configUrl: candidate.configUrl,
		pipesUrl: candidate.pipesUrl
	};

}

function normalizeAssetTransform(value: unknown): ModelAssetTransform | undefined {

	if ( typeof value !== 'object' || value === null ) {
		return undefined;
	}

	const candidate = value as Partial<ModelAssetTransform>;
	const upAxis = candidate.upAxis === 'z' ? 'z' : candidate.upAxis === 'y' ? 'y' : undefined;
	const scaleFactor = typeof candidate.scaleFactor === 'number' && Number.isFinite( candidate.scaleFactor )
		? candidate.scaleFactor
		: undefined;
	const disableAutoScale = candidate.disableAutoScale === true;

	if ( upAxis === undefined && scaleFactor === undefined && disableAutoScale === false ) {
		return undefined;
	}

	return { upAxis, scaleFactor, disableAutoScale };

}
