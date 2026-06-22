import type { PipeRecord } from '../load-model/types.js';

export type WorkspaceMode = 'browse' | 'registration' | 'timeline' | 'inspection';

export interface PropertyPanelState {
	name: string;
	statusBadge: string;
	type: string;
	diameter: string;
	material: string;
	depth: string;
	status: string;
	remark: string;
}

export interface ManualReadoutState {
	positionText: string;
	yawText: string;
	scaleText: string;
}

export interface RegistrationMetricsState {
	gpsText: string;
	enuText: string;
	rmsText: string;
}

export interface PlacementSummaryState {
	positionText: string;
	quaternionText: string;
	scaleText: string;
}

export interface RegistrationStoreState {
	projectName: string;
	modelUrl: string;
	workspaceMode: WorkspaceMode;
	timelineStages: readonly string[];
	currentTimelineStageIndex: number;
	layerNames: readonly string[];
	pipeList: PipeRecord[];
	propertyPanel: PropertyPanelState;
	manualReadout: ManualReadoutState;
	registrationMetrics: RegistrationMetricsState;
	placementSummary: PlacementSummaryState;
	registrationStatusDetail: string;
	runtimeStatus: string;
	desktopPreviewBadge: string;
	logMessages: string[];
}

type RegistrationStoreListener = (state: RegistrationStoreState) => void;

export interface RegistrationStore {
	getState(): RegistrationStoreState;
	patch(partialState: Partial<RegistrationStoreState>): void;
	subscribe(listener: RegistrationStoreListener): () => void;
}

export function createRegistrationStore(
	initialState: RegistrationStoreState
): RegistrationStore {

	let state = initialState;
	const listeners = new Set<RegistrationStoreListener>();

	function emit(): void {

		for ( const listener of listeners ) {
			listener( state );
		}

	}

	return {
		getState() {

			return state;

		},
		patch(partialState) {

			state = { ...state, ...partialState };
			emit();

		},
		subscribe(listener) {

			listeners.add( listener );
			return () => {
				listeners.delete( listener );
			};

		}
	};

}

export function createDefaultPropertyPanelState(): PropertyPanelState {

	return {
		name: '请选择一段管线',
		statusBadge: '待选择',
		type: '-',
		diameter: '-',
		material: '-',
		depth: '-',
		status: '-',
		remark: '点击模型即可查看该管线的属性、埋深和备注信息。'
	};

}

export function createDefaultManualReadoutState(): ManualReadoutState {

	return {
		positionText: '左移 0.00m / 上移 0.00m / 前移 0.00m',
		yawText: '0deg',
		scaleText: '1.000x'
	};

}

export function createDefaultRegistrationMetricsState(): RegistrationMetricsState {

	return {
		gpsText: '-',
		enuText: '-',
		rmsText: '-'
	};

}

export function createDefaultPlacementSummaryState(): PlacementSummaryState {

	return {
		positionText: '-',
		quaternionText: '-',
		scaleText: '-'
	};

}
