import { createRoot } from 'react-dom/client';
import { createLoadModelArController } from './controller/load-model-ar-controller.js';
import { LoadModelArApp } from './react/app.js';

const container = document.getElementById( 'app' );

if ( container === null ) {
	throw new Error( 'Missing root element: #app' );
}

const controller = createLoadModelArController();
const root = createRoot( container );

root.render( <LoadModelArApp controller={controller} /> );
