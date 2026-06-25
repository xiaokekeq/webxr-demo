import type { PipeRecord } from '../../../../load-model/types.js';
import * as THREE from 'three';
import {
	createDefaultPlacementSummaryState,
	createDefaultPrecisionRegistrationState,
	createDefaultPropertyPanelState,
	createDefaultRegistrationMetricsState,
	type RegistrationStore
} from '../../../registration/registration-store.js';
import {
	fetchModelCatalog,
	findModelCatalogItem,
	type ModelCatalogItem
} from '../../../data/model-catalog.js';
import type { EngineeringRegistrationSolution } from '../../../registration/engineering-registration.js';
import type { EngineeringControlPoint } from '../../../registration/engineering-registration.js';
import type { SetStatus } from '../../../shared/types.js';
import { loadModelRuntimeBundle, type LoadedModelRuntimeBundle } from './runtime.js';
import { createRegistrationMetricsState } from '../runtime/view-state.js';

interface CreateModelSessionOptions {
	defaultDesktopPreviewBadge: string;
	canShowPreviewAfterModelLoad(): boolean;
	store: RegistrationStore;
	setStatus: SetStatus;
	appendLog(message: string): void;
	resetPlacement(): void;
	onRuntimeReset(): void;
	onRuntimeBundleLoaded(bundle: LoadedModelRuntimeBundle): void;
	onAfterModelLoaded(): void;
	onCreateCoarseRegistrationTarget(solution: EngineeringRegistrationSolution): void;
	onLoadManualRegistration(modelId: string): void;
	onLoadPrecisionRegistration(modelId: string): void;
	onUpdatePrecisionSourcePointOptions(sourcePoints: EngineeringControlPoint[]): void;
	canRequestAutoPlacement(): boolean;
	requestAutoPlacement(): void;
}

export interface ModelSessionController {
	initializeCatalog(): Promise<void>;
	handleModelSelection(modelId: string): void;
	loadSelectedModelResources(modelDefinition: ModelCatalogItem): Promise<void>;
	getCurrentModelDefinition(): ModelCatalogItem | null;
}

export function createModelSession(options: CreateModelSessionOptions): ModelSessionController {

	const {
		defaultDesktopPreviewBadge,
		canShowPreviewAfterModelLoad,
		store,
		setStatus,
		appendLog,
		resetPlacement,
		onRuntimeReset,
		onRuntimeBundleLoaded,
		onAfterModelLoaded,
		onCreateCoarseRegistrationTarget,
		onLoadManualRegistration,
		onLoadPrecisionRegistration,
		onUpdatePrecisionSourcePointOptions,
		canRequestAutoPlacement,
		requestAutoPlacement
	} = options;

	let currentModelDefinition: ModelCatalogItem | null = null;
	let modelLoadRequestId = 0;

	async function loadSelectedModelResources(modelDefinition: ModelCatalogItem): Promise<void> {

		const requestId = ++modelLoadRequestId;

		resetPlacement();
		onRuntimeReset();
		currentModelDefinition = null;

		store.patch( {
			selectedModelId: modelDefinition.id,
			modelUrl: modelDefinition.modelUrl,
			pipeList: [],
			propertyPanel: createDefaultPropertyPanelState(),
			registrationMetrics: createDefaultRegistrationMetricsState(),
			placementSummary: createDefaultPlacementSummaryState(),
			precisionRegistration: createDefaultPrecisionRegistrationState(),
			registrationStatusDetail: '状态：正在加载模型资源',
			desktopPreviewBadge: defaultDesktopPreviewBadge
		} );

		appendLog( `正在加载模型：${modelDefinition.name}` );

		const bundle = await loadModelRuntimeBundle( modelDefinition, setStatus );
		if ( requestId !== modelLoadRequestId ) {
			return;
		}

		currentModelDefinition = bundle.modelDefinition;
		onRuntimeBundleLoaded( bundle );
		onLoadManualRegistration( bundle.demoModelConfig.modelId );
		onLoadPrecisionRegistration( bundle.demoModelConfig.modelId );
		onUpdatePrecisionSourcePointOptions( bundle.registrationSolution.controlPoints );

		store.patch( {
			modelUrl: modelDefinition.modelUrl,
			pipeList: Array.from( bundle.pipesByName.values() as Iterable<PipeRecord> ),
			registrationMetrics: createRegistrationMetricsState(
				bundle.demoModelConfig,
				bundle.registrationSolution
			)
		} );

		const controlPointDiagnostics = analyzeControlPointDiagnostics(
			bundle.modelTemplate,
			bundle.registrationSolution.controlPoints
		);

		appendLog( `模型加载完成：${modelDefinition.name}` );
		appendModelSourceMetadataLog( bundle, appendLog );
		appendLog(
			`工程配准求解完成，控制点数量：${bundle.registrationSolution.controlPoints.length}`
		);
		if ( controlPointDiagnostics.length > 0 ) {
			appendLog( '检测到控制点数据与模型几何可能不匹配，请优先复核 controlPoints 配置。' );
			for ( const diagnostic of controlPointDiagnostics ) {
				appendLog( diagnostic );
			}
		}

		onCreateCoarseRegistrationTarget( bundle.registrationSolution );
		store.patch( {
			registrationStatusDetail: controlPointDiagnostics.length > 0
				? '状态：模型已就绪，但控制点数据需要复核'
				: '状态：模型已就绪，等待识别平面'
		} );

		if ( canShowPreviewAfterModelLoad() ) {
			onAfterModelLoaded();
		}

		if ( canRequestAutoPlacement() ) {
			requestAutoPlacement();
		}

		setStatus(
			`已加载 ${modelDefinition.name}，RMS ${bundle.registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m。`
		);

	}

	return {
		async initializeCatalog() {

			const availableModels = await fetchModelCatalog();
			if ( availableModels.length === 0 ) {
				throw new Error( '未在 /pipe-viewer/models.json 中找到模型条目。' );
			}

			store.patch( {
				availableModels,
				selectedModelId: availableModels[ 0 ].id
			} );

			await loadSelectedModelResources( availableModels[ 0 ] );

		},

		handleModelSelection(modelId) {

			if ( modelId.length === 0 ) {
				return;
			}

			const nextModel = findModelCatalogItem( store.getState().availableModels, modelId );
			if ( nextModel === null ) {
				setStatus( `未识别的模型 ID：${modelId}` );
				return;
			}

			if ( currentModelDefinition?.id === nextModel.id ) {
				return;
			}

			void loadSelectedModelResources( nextModel ).catch( ( error ) => {
				console.error( 'Model switch failed:', error );
				setStatus( error instanceof Error ? error.message : '切换模型失败。' );
			} );

		},

		loadSelectedModelResources,


		getCurrentModelDefinition() {

			return currentModelDefinition;

		}
	};

}

function appendModelSourceMetadataLog(
	bundle: LoadedModelRuntimeBundle,
	appendLog: (message: string) => void
): void {

	const metadata = bundle.modelSourceMetadata;
	if ( metadata === null ) {
		return;
	}

	const sourceName = metadata.originalName ?? bundle.modelDefinition.modelUrl;
	const unitText = metadata.unitScaleFactor === null
		? '未提供'
		: metadata.unitScaleFactor.toFixed( 3 );

	appendLog( `模型源信息：${metadata.format.toUpperCase()} / ${sourceName} / UnitScaleFactor=${unitText}` );

	if ( metadata.embeddedGeoOrigin !== null ) {
		appendLog(
			`检测到模型内嵌坐标候选：${metadata.embeddedGeoOrigin.lon.toFixed( 6 )}, ${metadata.embeddedGeoOrigin.lat.toFixed( 6 )}，来源 ${metadata.embeddedGeoOrigin.sourcePath}。当前仍以 configUrl 为准。`
		);
		return;
	}

	if ( metadata.format === 'fbx' ) {
		appendLog( '当前 FBX 未检测到可直接用于工程配准的经纬度元数据，仍需外部 config 提供站点坐标。' );
	}

}

function analyzeControlPointDiagnostics(
	modelTemplate: THREE.Group,
	controlPoints: EngineeringControlPoint[]
): string[] {

	if ( controlPoints.length === 0 ) {
		return [];
	}

	const diagnostics: string[] = [];
	const bounds = new THREE.Box3().setFromObject( modelTemplate );
	if ( bounds.isEmpty() ) {
		return diagnostics;
	}

	const size = bounds.getSize( new THREE.Vector3() );
	const diagonal = size.length();
	const tolerance = Math.max( diagonal * 0.05, 0.15 );
	const expandedBounds = bounds.clone().expandByScalar( tolerance );
	const outsideIds = controlPoints
		.filter( ( point ) => expandedBounds.containsPoint( point.modelLocal ) === false )
		.map( ( point ) => point.id );

	if ( outsideIds.length > 0 ) {
		diagnostics.push( `以下控制点落在模型包围盒外：${outsideIds.join( '、' )}。` );
	}

	let maxControlSpan = 0;
	for ( let i = 0; i < controlPoints.length; i += 1 ) {
		for ( let j = i + 1; j < controlPoints.length; j += 1 ) {
			maxControlSpan = Math.max(
				maxControlSpan,
				controlPoints[ i ].modelLocal.distanceTo( controlPoints[ j ].modelLocal )
			);
		}
	}

	if ( diagonal > 1e-6 && maxControlSpan > diagonal * 1.5 ) {
		diagnostics.push(
			`控制点最大跨度 ${maxControlSpan.toFixed( 2 )}m，明显大于模型包围盒对角线 ${diagonal.toFixed( 2 )}m。`
		);
	}

	return diagnostics;

}




