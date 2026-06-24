import type { PipeRecord } from '../../load-model/types.js';
import type { ModelCatalogItem } from './model-catalog.js';

export type WorkspaceMode = 'browse' | 'registration' | 'tools' | 'inspection';
export type AppMode = 'pre-ar' | 'ar-session';
export type ArSupportState = 'checking' | 'supported' | 'unsupported';
export type ArSessionPhase = 'scanning' | 'ready-to-place' | 'placing' | 'placed';
export type DisplayMode = 'normal' | 'xray' | 'occlusion-outline';

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

export interface PrecisionRegistrationState {
	availableSourcePoints: string[];
	selectedSourcePoint: string;
	stagedSourcePoint: string;
	stagedTargetPoint: string;
	pairSummaries: string[];
	rmsText: string;
	workflowStatusText: string;
}

export interface RegistrationStoreState {
	projectName: string;
	modelUrl: string;
	availableModels: ModelCatalogItem[];
	selectedModelId: string;
	appMode: AppMode;
	arSupportState: ArSupportState;
	arSupportMessage: string;
	arSessionPhase: ArSessionPhase;
	workspaceMode: WorkspaceMode;
	displayMode: DisplayMode;
	timelineStages: readonly string[];
	currentTimelineStageIndex: number;
	layerNames: readonly string[];
	pipeList: PipeRecord[];
	propertyPanel: PropertyPanelState;
	manualReadout: ManualReadoutState;
	registrationMetrics: RegistrationMetricsState;
	placementSummary: PlacementSummaryState;
	precisionRegistration: PrecisionRegistrationState;
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
		name: '请选择一个堤防构件',
		statusBadge: '待选择',
		type: '-',
		diameter: '-',
		material: '-',
		depth: '-',
		status: '-',
		remark: '点击模型即可查看该堤防构件的属性、位置和备注信息。'
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

export function createDefaultPrecisionRegistrationState(): PrecisionRegistrationState {

	return {
		availableSourcePoints: [],
		selectedSourcePoint: '',
		stagedSourcePoint: '未选择',
		stagedTargetPoint: '未确认',
		pairSummaries: [],
		rmsText: '--',
		workflowStatusText: '已有粗配准结果，接下来可采集控制点。'
	};

}
