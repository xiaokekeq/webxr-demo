import type { PipeRecord } from '../load-model/types.js';
import type { ARDomElements } from './types.js';
import type { RegistrationStoreState } from './registration-store.js';

interface DesktopPanelActions {
	onSaveRegistration(): void;
	onExportJson(): void;
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

		},
		render(state) {

			dom.modelNameEl.textContent = state.modelUrl;
			dom.desktopCurrentModelEl.textContent = state.modelUrl;
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

			renderPipeList( dom.desktopPipeListEl, state.pipeList );
			renderSimpleList( dom.desktopLayerListEl, state.layerNames );
			renderSimpleList(
				dom.desktopStageListEl,
				state.timelineStages.map( ( item, index ) => `${index + 1}. ${item}` )
			);
			renderSimpleList( dom.desktopLogListEl, state.logMessages, 'log-item' );

		}
	};

}

function renderPipeList(host: HTMLElement, pipeList: PipeRecord[]): void {

	const items = pipeList.slice( 0, 12 );
	const nodes = items.length === 0
		? [ createTextBlock( 'div', 'desktop-list-item', '暂无管线对象' ) ]
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
