import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';

const container = document.getElementById( 'app' );

if ( container === null ) {
	throw new Error( 'Missing root element: #app' );
}

createRoot( container ).render( <App /> );
