import { DISPLAY_MODES } from './config.js';
import type { DisplayMode, PipeRecord, PropertyElements } from './types.js';

const SCREEN_MARGIN = 10;
const ANCHOR_OFFSET = 10;

export function getPropertyElements(): PropertyElements {

	return {
		panel: getElement( 'property-panel' ),
		name: getElement( 'prop-name' ),
		type: getElement( 'prop-type' ),
		diameter: getElement( 'prop-diameter' ),
		material: getElement( 'prop-material' ),
		depth: getElement( 'prop-depth' ),
		status: getElement( 'prop-status' ),
		remark: getElement( 'prop-remark' )
	};

}

export function updatePropertyPanel(
	propertyEls: PropertyElements,
	businessName: string | null,
	properties: PipeRecord | null
): void {

	propertyEls.name.textContent = businessName || '-';
	propertyEls.type.textContent = properties?.type || '-';
	propertyEls.diameter.textContent = properties?.diameter || '-';
	propertyEls.material.textContent = properties?.material || '-';
	propertyEls.depth.textContent = properties?.depth || '-';
	propertyEls.status.textContent = properties?.status || '-';
	propertyEls.remark.textContent = properties?.remark || 'pipes.json 中暂无这条业务数据';

}

export function showPropertyPanel(propertyEls: PropertyElements): void {

	propertyEls.panel.classList.remove( 'hidden' );

}

export function resetPropertyPanel(propertyEls: PropertyElements): void {

	propertyEls.name.textContent = '未选择';
	propertyEls.type.textContent = '-';
	propertyEls.diameter.textContent = '-';
	propertyEls.material.textContent = '-';
	propertyEls.depth.textContent = '-';
	propertyEls.status.textContent = '-';
	propertyEls.remark.textContent = '点击模型后显示';
	propertyEls.panel.classList.add( 'hidden' );
	propertyEls.panel.style.left = '0px';
	propertyEls.panel.style.top = '0px';

}

export function positionPropertyPanel(
	propertyEls: PropertyElements,
	screenX: number,
	screenY: number,
	viewportWidth: number,
	viewportHeight: number
): void {

	const panelRect = propertyEls.panel.getBoundingClientRect();
	const panelWidth = panelRect.width;
	const panelHeight = panelRect.height;

	const clampedX = clamp(
		screenX,
		SCREEN_MARGIN + panelWidth / 2,
		viewportWidth - SCREEN_MARGIN - panelWidth / 2
	);

	const clampedY = clamp(
		screenY - ANCHOR_OFFSET,
		SCREEN_MARGIN + panelHeight,
		viewportHeight - SCREEN_MARGIN
	);

	propertyEls.panel.style.left = `${clampedX}px`;
	propertyEls.panel.style.top = `${clampedY}px`;

}

export function updateModeButtons(buttons: NodeListOf<HTMLButtonElement>, currentMode: DisplayMode): void {

	buttons.forEach( ( button ) => {
		button.classList.toggle( 'active', button.dataset.mode === currentMode );
	} );

}

export function isSupportedDisplayMode(value: string | undefined): value is DisplayMode {

	return value === DISPLAY_MODES.solid
		|| value === DISPLAY_MODES.transparent
		|| value === DISPLAY_MODES.structure;

}

function getElement(id: string): HTMLElement {

	const element = document.getElementById( id );
	if ( element === null ) {
		throw new Error( `Missing DOM element: #${id}` );
	}

	return element;

}

function clamp(value: number, min: number, max: number): number {

	return Math.min( Math.max( value, min ), max );

}
