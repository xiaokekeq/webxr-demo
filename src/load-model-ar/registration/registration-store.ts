import type { PipeRecord } from '../../load-model/types.js';
import { createStore } from 'zustand/vanilla';
import type { ModelCatalogItem } from './model-catalog.js';

export type WorkspaceMode = 'browse' | 'registration' | 'tools' | 'inspection';
export type AppMode = 'pre-ar' | 'ar-session';
export type ArSupportState = 'checking' | 'supported' | 'unsupported';
export type ArSessionPhase = 'scanning' | 'ready-to-place' | 'placing' | 'placed';
export type DisplayMode = 'normal' | 'xray' | 'occlusion-outline';
export type PrecisionFeedbackTone = 'neutral' | 'info' | 'success' | 'error';
export type MeasurementMode = 'distance-3d' | 'distance-horizontal' | 'depth';

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
	targetQualityText: string;
	lastCapturedSourcePoint: string;
	lastCapturedTargetPoint: string;
	lastCapturedQualityText: string;
	pairSummaries: string[];
	pairResidualSummaries: string[];
	rmsText: string;
	workflowStatusText: string;
	feedbackText: string;
	feedbackTone: PrecisionFeedbackTone;
	feedbackUpdatedAt: string;
	isSourceLocked: boolean;
	hasConfirmedTarget: boolean;
}

export interface MeasurementState {
	activeMode: MeasurementMode | null;
	activeLabel: string;
	isCapturing: boolean;
	requiredPointCount: number;
	capturedPointLabels: string[];
	targetQualityText: string;
	resultText: string;
	detailText: string;
	feedbackText: string;
	feedbackTone: PrecisionFeedbackTone;
	feedbackUpdatedAt: string;
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
	measurement: MeasurementState;
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

	const store = createStore<RegistrationStoreState>()( () => initialState );

	return {
		getState() {

			return store.getState();

		},
		patch(partialState) {

			store.setState( partialState );

		},
		subscribe(listener) {

			return store.subscribe( listener );

		}
	};

}

export function createDefaultPropertyPanelState(): PropertyPanelState {

	return {
		name: '未选择构件',
		statusBadge: '待选择',
		type: '-',
		diameter: '-',
		material: '-',
		depth: '-',
		status: '-',
		remark: '点击模型构件后可查看属性、位置和备注信息。'
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
		targetQualityText: '尚未采样',
		lastCapturedSourcePoint: '暂无',
		lastCapturedTargetPoint: '暂无',
		lastCapturedQualityText: '暂无',
		pairSummaries: [],
		pairResidualSummaries: [],
		rmsText: '--',
		workflowStatusText: '完成粗配准后可继续采集控制点。',
		feedbackText: '',
		feedbackTone: 'neutral',
		feedbackUpdatedAt: '',
		isSourceLocked: false,
		hasConfirmedTarget: false
	};

}

export function createDefaultMeasurementState(): MeasurementState {

	return {
		activeMode: null,
		activeLabel: '未开始',
		isCapturing: false,
		requiredPointCount: 2,
		capturedPointLabels: [],
		targetQualityText: '尚未采样',
		resultText: '--',
		detailText: '请选择一种测量模式。',
		feedbackText: '',
		feedbackTone: 'neutral',
		feedbackUpdatedAt: ''
	};

}
