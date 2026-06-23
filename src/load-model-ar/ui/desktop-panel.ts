import type { PipeRecord } from '../../load-model/types.js';
import type { ModelCatalogItem } from '../data/model-catalog.js';
import type { RegistrationStoreState } from '../data/registration-store.js';
import type { ARDomElements } from './types.js';

interface DesktopPanelActions {
	onSaveRegistration(): void;
	onExportJson(): void;
	onSelectModel(modelId: string): void;
	onSelectPrecisionSourcePoint(sourcePoint: string): void;
	onArmPrecisionSourcePoint(): void;
	onConfirmPrecisionTargetPoint(): void;
	onAddPrecisionPair(): void;
	onSolvePrecisionRegistration(): void;
	onSavePrecisionRegistration(): void;
	onClearPrecisionPairs(): void;
}

export interface DesktopPanelController {
	bind(actions: DesktopPanelActions): void;
	render(state: RegistrationStoreState): void;
}

export function createDesktopPanel(dom: ARDomElements): DesktopPanelController {

	return {
		bind(actions) {

			dom.desktopSaveRegistrationButton.addEventListener( 'click', actions.onSaveRegistration );
			dom.desktopExportJsonButton.addEventListener( 'click', actions.onExportJson );
			dom.desktopModelSelectEl.addEventListener( 'change', () => {
				actions.onSelectModel( dom.desktopModelSelectEl.value );
			} );
			dom.desktopPrecisionSourceSelectEl.addEventListener( 'change', () => {
				actions.onSelectPrecisionSourcePoint( dom.desktopPrecisionSourceSelectEl.value );
			} );
			dom.desktopPrecisionSourceArmButton.addEventListener( 'click', actions.onArmPrecisionSourcePoint );
			dom.desktopPrecisionTargetConfirmButton.addEventListener( 'click', actions.onConfirmPrecisionTargetPoint );
			dom.desktopPrecisionPairAddButton.addEventListener( 'click', actions.onAddPrecisionPair );
			dom.desktopPrecisionSolveButton.addEventListener( 'click', actions.onSolvePrecisionRegistration );
			dom.desktopPrecisionSaveButton.addEventListener( 'click', actions.onSavePrecisionRegistration );
			dom.desktopPrecisionClearButton.addEventListener( 'click', actions.onClearPrecisionPairs );

		},
		render(state) {

			const currentModelName = state.availableModels.find( ( model ) => model.id === state.selectedModelId )?.name ?? '-';

			dom.modelNameEl.textContent = state.modelUrl;
			dom.desktopCurrentModelEl.textContent = currentModelName;
			dom.desktopModelFileEl.textContent = state.modelUrl;
			dom.desktopProjectNameEl.textContent = state.projectName;
			dom.desktopRuntimeStatusEl.textContent = state.runtimeStatus;
			dom.desktopPreviewBadgeEl.textContent = state.desktopPreviewBadge;
			dom.desktopParamGpsEl.textContent = state.registrationMetrics.gpsText;
			dom.desktopParamEnuEl.textContent = state.registrationMetrics.enuText;
			dom.desktopParamRmsEl.textContent = state.registrationMetrics.rmsText;
			dom.desktopParamPositionEl.textContent = state.placementSummary.positionText;
			dom.desktopParamQuaternionEl.textContent = state.placementSummary.quaternionText;
			dom.desktopParamScaleEl.textContent = state.placementSummary.scaleText;
			dom.desktopPrecisionSourceCurrentEl.textContent = state.precisionRegistration.stagedSourcePoint;
			dom.desktopPrecisionTargetCurrentEl.textContent = state.precisionRegistration.stagedTargetPoint;
			dom.desktopPrecisionPairCountEl.textContent = `${state.precisionRegistration.pairSummaries.length} / 建议至少 4 组`;
			dom.desktopPrecisionRmsEl.textContent = state.precisionRegistration.rmsText;
			dom.desktopPrecisionWorkflowStatusEl.textContent = state.precisionRegistration.workflowStatusText;

			renderModelSelect( dom.desktopModelSelectEl, state.availableModels, state.selectedModelId );
			renderSelectOptions(
				dom.desktopPrecisionSourceSelectEl,
				state.precisionRegistration.availableSourcePoints.map( ( point ) => ( {
					value: point,
					label: point
				} ) ),
				state.precisionRegistration.selectedSourcePoint,
				'请选择模型控制点'
			);

			renderPipeList( dom.desktopPipeListEl, state.pipeList );
			renderSimpleList( dom.desktopLayerListEl, state.layerNames );
			renderSimpleList(
				dom.desktopStageListEl,
				state.timelineStages.map( ( item, index ) => `${index + 1}. ${item}` )
			);
			renderSimpleList(
				dom.desktopPrecisionPairListEl,
				state.precisionRegistration.pairSummaries.length === 0
					? [ '还没有采集控制点对' ]
					: state.precisionRegistration.pairSummaries
			);
			renderSimpleList( dom.desktopLogListEl, state.logMessages, 'log-item' );

		}
	};

}

function renderModelSelect(
	select: HTMLSelectElement,
	models: ModelCatalogItem[],
	selectedModelId: string
): void {

	renderSelectOptions(
		select,
		models.map( ( model ) => ( { value: model.id, label: model.name } ) ),
		selectedModelId,
		'请选择模型'
	);

}

function renderSelectOptions(
	select: HTMLSelectElement,
	options: Array<{ value: string; label: string }>,
	selectedValue: string,
	placeholderLabel: string
): void {

	const nextOptions = [ { value: '', label: placeholderLabel }, ...options ];
	const shouldRebuild = select.options.length !== nextOptions.length
		|| nextOptions.some( ( option, index ) => select.options[ index ]?.value !== option.value );

	if ( shouldRebuild ) {
		select.replaceChildren(
			...nextOptions.map( ( option ) => {
				const element = document.createElement( 'option' );
				element.value = option.value;
				element.textContent = option.label;
				return element;
			} )
		);
	}

	select.value = nextOptions.some( ( option ) => option.value === selectedValue ) ? selectedValue : '';
	select.disabled = options.length === 0;

}

function renderPipeList(host: HTMLElement, pipeList: PipeRecord[]): void {

	const items = pipeList.slice( 0, 12 );
	const nodes = items.length === 0
		? [ createTextBlock( 'div', 'desktop-list-item', '暂无堤防对象' ) ]
		: items.map( ( item ) => createPipeListItem( item ) );

	host.replaceChildren( ...nodes );

}

function createPipeListItem(item: PipeRecord): HTMLDivElement {

	const detail = [ item.type, item.diameter ].filter( Boolean ).join( ' / ' ) || '未分类';
	const container = document.createElement( 'div' );
	const name = document.createElement( 'strong' );

	container.className = 'desktop-list-item';
	name.textContent = item.name;
	container.append( name, document.createElement( 'br' ), document.createTextNode( detail ) );

	return container;

}

function renderSimpleList(
	host: HTMLElement,
	items: readonly string[],
	className = 'desktop-list-item'
): void {

	host.replaceChildren(
		...items.map( ( item ) => createTextBlock( 'div', className, item ) )
	);

}

function createTextBlock<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	className: string,
	text: string
): HTMLElementTagNameMap[K] {

	const element = document.createElement( tagName );
	element.className = className;
	element.textContent = text;

	return element;

}
