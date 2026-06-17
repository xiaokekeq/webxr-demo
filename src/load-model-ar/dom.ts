import type { ARDomElements, SetStatus } from './types.js';

export function getARDomElements(): ARDomElements {

	return {
		overlayEl: getElement( 'overlay' ),
		overlayToggleButton: getElement( 'overlay-toggle' ) as HTMLButtonElement,
		overlayBodyEl: getElement( 'overlay-body' ),
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

export function setupOverlayToggle(dom: ARDomElements): void {

	const mediaQuery = window.matchMedia( '(max-width: 720px)' );
	updateOverlayMode( dom, mediaQuery.matches );

	dom.overlayToggleButton.addEventListener( 'click', () => {
		if ( mediaQuery.matches === false ) {
			return;
		}

		toggleOverlay( dom );
	} );

	mediaQuery.addEventListener( 'change', ( event ) => {
		updateOverlayMode( dom, event.matches );
	} );

}

function updateOverlayMode(dom: ARDomElements, isMobile: boolean): void {

	if ( isMobile ) {
		dom.overlayEl.classList.add( 'mobile-collapsed' );
		dom.overlayToggleButton.hidden = false;
		dom.overlayToggleButton.textContent = '展开';
		dom.overlayToggleButton.setAttribute( 'aria-expanded', 'false' );
		return;
	}

	dom.overlayEl.classList.remove( 'mobile-collapsed' );
	dom.overlayToggleButton.hidden = true;
	dom.overlayToggleButton.textContent = '收起';
	dom.overlayToggleButton.setAttribute( 'aria-expanded', 'true' );

}

function toggleOverlay(dom: ARDomElements): void {

	const collapsed = dom.overlayEl.classList.toggle( 'mobile-collapsed' );
	dom.overlayToggleButton.textContent = collapsed ? '展开' : '收起';
	dom.overlayToggleButton.setAttribute( 'aria-expanded', String( collapsed === false ) );

}

function getElement(id: string): HTMLElement {

	const element = document.getElementById( id );
	if ( element === null ) {
		throw new Error( `Missing DOM element: #${id}` );
	}

	return element;

}
