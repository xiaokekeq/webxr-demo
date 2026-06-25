import type { PipeRecord } from '../../../../load-model/types.js';
import type { DemoModelConfig } from '../../../data/demo-model-config.js';
import type { ModelCatalogItem } from '../../../data/model-catalog.js';
import {
	readModelSourceMetadata,
	type ModelSourceMetadata
} from '../../../data/model-source-metadata.js';
import { loadDemoModelConfig } from '../../../data/demo-model-config.js';
import { loadPipeRecords } from '../../../data/model-data.js';
import {
	solveEngineeringRegistration,
	type EngineeringRegistrationSolution
} from '../../../registration/engineering-registration.js';
import type { SetStatus } from '../../../shared/types.js';
import { loadModelTemplate } from '../../model.js';

export interface LoadedModelRuntimeBundle {
	pipesByName: Map<string, PipeRecord>;
	demoModelConfig: DemoModelConfig;
	modelTemplate: Awaited<ReturnType<typeof loadModelTemplate>>;
	modelSourceMetadata: ModelSourceMetadata | null;
	registrationSolution: EngineeringRegistrationSolution;
	modelDefinition: ModelCatalogItem;
}

export async function loadModelRuntimeBundle(
	modelDefinition: ModelCatalogItem,
	setStatus: SetStatus
): Promise<LoadedModelRuntimeBundle> {

	const [ pipesByName, demoModelConfig, modelTemplate ] = await Promise.all( [
		loadPipeRecords( modelDefinition.pipesUrl ),
		loadDemoModelConfig( modelDefinition.configUrl, setStatus ),
		loadModelTemplate(
			modelDefinition.modelUrl,
			setStatus,
			1,
			modelDefinition.materialUrl,
			modelDefinition.assetTransform
		)
	] );

	return {
		pipesByName,
		demoModelConfig,
		modelTemplate,
		modelSourceMetadata: readModelSourceMetadata( modelTemplate ),
		registrationSolution: solveEngineeringRegistration( demoModelConfig ),
		modelDefinition
	};

}
