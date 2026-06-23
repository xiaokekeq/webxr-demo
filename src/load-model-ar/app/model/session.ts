import type { PipeRecord } from '../../../load-model/types.js';
import {
	createDefaultPlacementSummaryState,
	createDefaultPrecisionRegistrationState,
	createDefaultPropertyPanelState,
	createDefaultRegistrationMetricsState,
	type RegistrationStore
} from '../../data/registration-store.js';
import {
	fetchModelCatalog,
	findModelCatalogItem,
	type ModelCatalogItem
} from '../../data/model-catalog.js';
import type { EngineeringRegistrationSolution } from '../../registration/engineering-registration.js';
import type { SetStatus } from '../../ui/types.js';
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
	onUpdatePrecisionSourcePointOptions(sourcePointIds: string[]): void;
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
			registrationStatusDetail: 'Status: loading model resources',
			desktopPreviewBadge: defaultDesktopPreviewBadge
		} );

		appendLog( `Loading model ${modelDefinition.name}.` );

		const bundle = await loadModelRuntimeBundle( modelDefinition, setStatus );
		if ( requestId !== modelLoadRequestId ) {
			return;
		}

		currentModelDefinition = bundle.modelDefinition;
		onRuntimeBundleLoaded( bundle );
		onLoadManualRegistration( bundle.demoModelConfig.modelId );
		onUpdatePrecisionSourcePointOptions(
			bundle.registrationSolution.controlPoints.map( ( point ) => point.id )
		);

		store.patch( {
			modelUrl: modelDefinition.modelUrl,
			pipeList: Array.from( bundle.pipesByName.values() as Iterable<PipeRecord> ),
			registrationMetrics: createRegistrationMetricsState(
				bundle.demoModelConfig,
				bundle.registrationSolution
			)
		} );

		appendLog( `Loaded model ${modelDefinition.name}.` );
		appendLog(
			`Engineering registration solved with ${bundle.registrationSolution.controlPoints.length} control points.`
		);

		onCreateCoarseRegistrationTarget( bundle.registrationSolution );
		store.patch( { registrationStatusDetail: 'Status: model ready / waiting for plane detection' } );

		if ( canShowPreviewAfterModelLoad() ) {
			onAfterModelLoaded();
		}

		if ( canRequestAutoPlacement() ) {
			requestAutoPlacement();
		}

		setStatus(
			`Loaded ${modelDefinition.name}. RMS ${bundle.registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m.`
		);

	}

	return {
		async initializeCatalog() {

			const availableModels = await fetchModelCatalog();
			if ( availableModels.length === 0 ) {
				throw new Error( 'No model entries were found in /pipe-viewer/models.json.' );
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
				setStatus( `Unknown model id: ${modelId}` );
				return;
			}

			if ( currentModelDefinition?.id === nextModel.id ) {
				return;
			}

			void loadSelectedModelResources( nextModel ).catch( ( error ) => {
				console.error( 'Model switch failed:', error );
				setStatus( error instanceof Error ? error.message : 'Failed to switch model.' );
			} );

		},

		loadSelectedModelResources,


		getCurrentModelDefinition() {

			return currentModelDefinition;

		}
	};

}
