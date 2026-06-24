import type { PipeRecord } from '../../../../load-model/types.js';
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

		appendLog( `模型加载完成：${modelDefinition.name}` );
		appendLog(
			`工程配准求解完成，控制点数量：${bundle.registrationSolution.controlPoints.length}`
		);

		onCreateCoarseRegistrationTarget( bundle.registrationSolution );
		store.patch( { registrationStatusDetail: '状态：模型已就绪，等待识别平面' } );

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




