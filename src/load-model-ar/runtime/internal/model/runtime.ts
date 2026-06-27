import * as THREE from 'three';
import type { PipeRecord } from '../../../../load-model/types.js';
import type { DemoModelAttachment, DemoModelConfig } from '../../../data/demo-model-config.js';
import type { ModelCatalogItem } from '../../../data/model-catalog.js';
import {
	attachModelSourceMetadata,
	readModelSourceMetadata,
	type ModelSourceMetadata
} from '../../../data/model-source-metadata.js';
import { loadDemoModelConfig } from '../../../data/demo-model-config.js';
import { loadPipeRecords } from '../../../data/model-data.js';
import {
	solveEngineeringRegistration,
	transformSiteEnuToModelLocal,
	type EngineeringRegistrationSolution
} from '../../../registration/engineering-registration.js';
import { geodeticToEnu } from '../../../registration/geodesy.js';
import type { SetStatus } from '../../../shared/types.js';
import { attachInfoBoardToAttachment } from '../../attachment-info-board.js';
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

	const [ pipesByName, demoModelConfig, loadedAssetTemplates ] = await Promise.all( [
		loadPipeRecords( modelDefinition.pipesUrl ),
		loadDemoModelConfig( modelDefinition.configUrl, setStatus ),
		loadCatalogAssetTemplates( modelDefinition, setStatus )
	] );
	const registrationSolution = solveEngineeringRegistration( demoModelConfig );
	const modelTemplate = composeModelTemplate( {
		modelDefinition,
		demoModelConfig,
		registrationSolution,
		loadedAssetTemplates
	} );

	return {
		pipesByName,
		demoModelConfig,
		modelTemplate,
		modelSourceMetadata: readModelSourceMetadata( modelTemplate ),
		registrationSolution,
		modelDefinition
	};

}

async function loadCatalogAssetTemplates(
	modelDefinition: ModelCatalogItem,
	setStatus: SetStatus
): Promise<Map<string, THREE.Group>> {

	const assetEntries = await Promise.all(
		modelDefinition.assets.map( async ( asset ) => ( {
			id: asset.id,
			template: await loadModelTemplate(
				asset.modelUrl,
				setStatus,
				1,
				asset.materialUrl,
				asset.assetTransform
			)
		} ) )
	);

	return new Map( assetEntries.map( ( entry ) => [ entry.id, entry.template ] ) );

}

function composeModelTemplate(options: {
	modelDefinition: ModelCatalogItem;
	demoModelConfig: DemoModelConfig;
	registrationSolution: EngineeringRegistrationSolution;
	loadedAssetTemplates: Map<string, THREE.Group>;
}): THREE.Group {

	const {
		modelDefinition,
		demoModelConfig,
		registrationSolution,
		loadedAssetTemplates
	} = options;
	const primaryTemplate = loadedAssetTemplates.get( modelDefinition.primaryAssetId );
	if ( primaryTemplate === undefined ) {
		throw new Error( `Primary asset template is missing: ${modelDefinition.primaryAssetId}` );
	}

	if ( demoModelConfig.attachments.length === 0 && loadedAssetTemplates.size === 1 ) {
		return primaryTemplate;
	}

	const compositeRoot = new THREE.Group();
	compositeRoot.name = `${modelDefinition.id}-composite-root`;
	compositeRoot.add( primaryTemplate );
	const primaryMetadata = readModelSourceMetadata( primaryTemplate );
	if ( primaryMetadata !== null ) {
		attachModelSourceMetadata( compositeRoot, primaryMetadata );
	}

	for ( const attachment of demoModelConfig.attachments ) {
		const attachmentTemplate = loadedAssetTemplates.get( attachment.assetId );
		if ( attachmentTemplate === undefined ) {
			console.warn( '[Model Runtime] Missing attachment asset:', attachment.assetId );
			continue;
		}

		positionAttachmentTemplate( attachmentTemplate, attachment, registrationSolution );
		if ( attachment.info !== undefined ) {
			attachInfoBoardToAttachment( attachmentTemplate, attachment.info );
		}
		compositeRoot.add( attachmentTemplate );
	}

	return compositeRoot;

}

function positionAttachmentTemplate(
	template: THREE.Group,
	attachment: DemoModelAttachment,
	registrationSolution: EngineeringRegistrationSolution
): void {

	const worldEnu = geodeticToEnu( attachment.world, registrationSolution.siteEnuFrame );
	const modelLocal = transformSiteEnuToModelLocal( worldEnu, registrationSolution );
	const yawRad = THREE.MathUtils.degToRad( attachment.yawDeg );

	template.rotation.set( 0, yawRad, 0 );
	template.scale.multiplyScalar( attachment.scaleMultiplier );
	template.updateMatrixWorld( true );
	const anchorOffset = getAttachmentAnchorOffset( template, attachment.anchorMode );
	template.position.copy( modelLocal ).sub( anchorOffset );
	template.updateMatrixWorld( true );

}

function getAttachmentAnchorOffset(
	template: THREE.Group,
	anchorMode: DemoModelAttachment['anchorMode']
): THREE.Vector3 {

	if ( anchorMode === 'base-center' ) {
		return new THREE.Vector3();
	}

	const bounds = new THREE.Box3().setFromObject( template );
	if ( bounds.isEmpty() ) {
		return new THREE.Vector3();
	}

	return bounds.getCenter( new THREE.Vector3() );

}
