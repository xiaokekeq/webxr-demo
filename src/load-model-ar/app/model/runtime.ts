import type { PipeRecord } from '../../../load-model/types.js';
import type { DemoModelConfig } from '../../data/demo-model-config.js';
import type { ModelCatalogItem } from '../../data/model-catalog.js';
import { loadDemoModelConfig } from '../../data/demo-model-config.js';
import { loadPipeRecords } from '../../data/model-data.js';
import {
	solveEngineeringRegistration,
	type EngineeringRegistrationSolution
} from '../../registration/engineering-registration.js';
import { loadModelTemplate } from '../../render/model.js';
import type { SetStatus } from '../../ui/types.js';

export interface LoadedModelRuntimeBundle {
	pipesByName: Map<string, PipeRecord>;
	demoModelConfig: DemoModelConfig;
	modelTemplate: Awaited<ReturnType<typeof loadModelTemplate>>;
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
		registrationSolution: solveEngineeringRegistration( demoModelConfig ),
		modelDefinition
	};

}
