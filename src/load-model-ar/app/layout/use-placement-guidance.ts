import { useEffect, useState } from 'react';
import type { ArState } from '../store/ar-state.js';

const HINT_VISIBLE_MS = 2400;
const HINT_REPEAT_MS = 7200;

type PlacementPhase = ArState['engine']['arSessionPhase'];

function isPlacementGuidancePhase(phase: PlacementPhase): boolean {

	return phase === 'scanning' || phase === 'ready-to-place';

}

export function usePlacementGuidance(phase: PlacementPhase): boolean {

	const [ visible, setVisible ] = useState( isPlacementGuidancePhase( phase ) );

	useEffect( () => {
		if ( isPlacementGuidancePhase( phase ) === false ) {
			setVisible( false );
			return;
		}

		let hideTimer = 0;
		let repeatTimer = 0;
		let disposed = false;

		const runCycle = (): void => {
			if ( disposed ) {
				return;
			}

			setVisible( true );
			hideTimer = window.setTimeout( () => {
				if ( disposed ) {
					return;
				}

				setVisible( false );
			}, HINT_VISIBLE_MS );

			repeatTimer = window.setTimeout( runCycle, HINT_REPEAT_MS );
		};

		runCycle();

		return () => {
			disposed = true;
			window.clearTimeout( hideTimer );
			window.clearTimeout( repeatTimer );
		};
	}, [ phase ] );

	return visible;

}
