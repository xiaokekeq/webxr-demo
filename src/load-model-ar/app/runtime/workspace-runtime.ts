import * as THREE from 'three';
import type { RegistrationStore, WorkspaceMode } from '../../data/registration-store.js';

interface CreateWorkspaceRuntimeOptions {
	store: RegistrationStore;
	setStatus(message: string): void;
}

export interface WorkspaceRuntime {
	setWorkspaceMode(mode: WorkspaceMode): void;
	setTimelineStage(index: number): void;
}

export function createWorkspaceRuntime(options: CreateWorkspaceRuntimeOptions): WorkspaceRuntime {

	const { store, setStatus } = options;

	return {
		setWorkspaceMode(mode) {

			if ( store.getState().workspaceMode === mode ) {
				return;
			}

			store.patch( { workspaceMode: mode } );
			setStatus( `Switched to ${getWorkspaceModeLabel( mode )}.` );

		},

		setTimelineStage(index) {

			const state = store.getState();
			const clampedIndex = THREE.MathUtils.clamp( index, 0, state.timelineStages.length - 1 );
			store.patch( { currentTimelineStageIndex: clampedIndex } );
			setStatus( `Stage switched to ${state.timelineStages[ clampedIndex ]}.` );

		}
	};

}

function getWorkspaceModeLabel(mode: WorkspaceMode): string {

	switch ( mode ) {
		case 'browse':
			return 'browse mode';
		case 'registration':
			return 'registration mode';
		case 'tools':
			return 'tools mode';
		case 'inspection':
			return 'inspection mode';
	}

}
