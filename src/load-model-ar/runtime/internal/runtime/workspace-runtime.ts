import * as THREE from 'three';
import type { RegistrationStore, WorkspaceMode } from '../../../registration/registration-store.js';

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
			setStatus( `已切换到${getWorkspaceModeLabel( mode )}` );

		},

		setTimelineStage(index) {

			const state = store.getState();
			const clampedIndex = THREE.MathUtils.clamp( index, 0, state.timelineStages.length - 1 );
			store.patch( { currentTimelineStageIndex: clampedIndex } );
			setStatus( `当前阶段已切换为：${state.timelineStages[ clampedIndex ]}` );

		}
	};

}

function getWorkspaceModeLabel(mode: WorkspaceMode): string {

	switch ( mode ) {
		case 'browse':
			return '浏览';
		case 'registration':
			return '配准';
		case 'tools':
			return '工具';
		case 'inspection':
			return '核查';
	}

}



