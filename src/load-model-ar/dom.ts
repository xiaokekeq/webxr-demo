import type { ARDomElements, SetStatus } from './types.js';

export function getARDomElements(): ARDomElements {

	return {
		modelNameEl: getElement( 'model-name' ),
		statusEl: getElement( 'status' ),
		canvasContainer: getElement( 'canvas-container' ),
		xrButtonWrap: getElement( 'xr-button-wrap' ),
		resetPlacementButton: getElement( 'reset-placement' ) as HTMLButtonElement
	};

}

export function createStatusUpdater(statusEl: HTMLElement): SetStatus {

	let currentStatus = '';

	return (message: string) => {
		if ( currentStatus === message ) {
			return;
		}

		currentStatus = message;
		statusEl.textContent = message;
	};

}

function getElement(id: string): HTMLElement {

	const element = document.getElementById( id );
	if ( element === null ) {
		throw new Error( `Missing DOM element: #${id}` );
	}

	return element;

}
