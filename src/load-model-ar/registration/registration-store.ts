import type { PipeRecord } from '../../load-model/types.js';
import { createStore } from 'zustand/vanilla';
import type { ModelCatalogItem } from './model-catalog.js';
import type { ManualAdjustmentPreset } from './manual-registration.js';

export type WorkspaceMode = 'browse' | 'registration' | 'tools' | 'inspection';
export type AppMode = 'pre-ar' | 'ar-session';
export type ArSupportState = 'checking' | 'supported' | 'unsupported';
export type ArSessionPhase = 'scanning' | 'ready-to-place' | 'placing' | 'placed';
export type ArDisplayMode =
	| 'solid-overlay'
	| 'transparent-xray'
	| 'spatial-reveal'
	| 'layer-peeling'
	| 'section-cut';
export type SectionCutPlaneMode = 'cross-section' | 'longitudinal-section' | 'horizontal-section';
export type DepthSensingMode = 'disabled' | 'gpu' | 'cpu' | 'auto';
export type PrecisionFeedbackTone = 'neutral' | 'info' | 'success' | 'error';
export type MeasurementMode = 'distance-3d' | 'distance-horizontal' | 'depth';

export interface PropertyPanelState {
	name: string;
	meshName?: string;
	materialName?: string;
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

export interface ModelScaleSummaryState {
	modeText: string;
	unitScaleText: string;
	originalBoundsText: string;
	finalBoundsText: string;
	pivotOffsetText: string;
}

export interface RegistrationChainDebugState {
	engineeringControlRegistration: {
		available: boolean;
		controlPointCount: number;
		rmsText: string;
		usesUnitScaleAndPivotOffset: boolean;
	};
	arSessionLocalization: {
		available: boolean;
		source: string;
		siteOriginArPositionText: string;
		headingDegText: string;
	};
	manualArSitePose: {
		exists: boolean;
		rootSiteEnuText: string;
		restored: boolean;
	};
	heightPolicy: {
		hitTestGroundYEnabled: boolean;
		enuGpsVerticalOffsetEnabled: boolean;
	};
	markerEngineering: {
		markerCount: number;
		markers: Array<{
			markerId: string;
			bindControlPointId: string;
			sizeMetersText: string;
			resolved: boolean;
		}>;
	};
}

export interface SavedMarkerLocalizationState {
	available: boolean;
	markerId?: string;
	markerConfigId?: string;
	timestamp?: number;
	ageSeconds?: number;
	rmsErrorMeters?: number;
	sampleCount?: number;
	headingDeg?: number;
	siteOriginArPosition?: { x: number; y: number; z: number };
	stable?: boolean;
}

export interface PlacementSummaryState {
	positionText: string;
	quaternionText: string;
	scaleText: string;
}

export interface ModelLayerState {
	id: string;
	label: string;
	visible: boolean;
	opacity: number;
	orderIndex: number;
}

export interface TargetGuidanceState {
	visible: boolean;
	directionText: string;
	distanceText: string;
	detailText: string;
	alignment: 'left' | 'center' | 'right';
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
	displayMode: ArDisplayMode;
	structureRevealValue: number;
	transparentXrayValue: number;
	spatialRevealValue: number;
	layerPeelingValue: number;
	sectionCutValue: number;
	sectionCutPlaneMode: SectionCutPlaneMode;
	timelineStages: readonly string[];
	currentTimelineStageIndex: number;
	layerNames: readonly string[];
	modelLayers: ModelLayerState[];
	pipeList: PipeRecord[];
	propertyPanel: PropertyPanelState;
	manualReadout: ManualReadoutState;
	manualAdjustmentPreset: ManualAdjustmentPreset;
	autoPreviewPlacementEnabled: boolean;
	depthSensingMode: DepthSensingMode;
	registrationMetrics: RegistrationMetricsState;
	modelScaleSummary: ModelScaleSummaryState;
	registrationChainDebug: RegistrationChainDebugState;
	savedMarkerLocalization: SavedMarkerLocalizationState;
	placementSummary: PlacementSummaryState;
	targetGuidance: TargetGuidanceState;
	measurement: MeasurementState;
	registrationStatusDetail: string;
	runtimeStatus: string;
	coarseLocationDebugText: string;
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

export function createDefaultModelScaleSummaryState(): ModelScaleSummaryState {

	return {
		modeText: '真实米制',
		unitScaleText: '1.000',
		originalBoundsText: '-',
		finalBoundsText: '-',
		pivotOffsetText: '-'
	};

}

export function createDefaultRegistrationChainDebugState(): RegistrationChainDebugState {

	return {
		engineeringControlRegistration: {
			available: false,
			controlPointCount: 0,
			rmsText: '-',
			usesUnitScaleAndPivotOffset: false
		},
		arSessionLocalization: {
			available: false,
			source: 'unknown',
			siteOriginArPositionText: '-',
			headingDegText: '-'
		},
		manualArSitePose: {
			exists: false,
			rootSiteEnuText: '-',
			restored: false
		},
		heightPolicy: {
			hitTestGroundYEnabled: true,
			enuGpsVerticalOffsetEnabled: false
		},
		markerEngineering: {
			markerCount: 0,
			markers: []
		}
	};

}

export function createDefaultPlacementSummaryState(): PlacementSummaryState {

	return {
		positionText: '-',
		quaternionText: '-',
		scaleText: '-'
	};

}

export function createDefaultSavedMarkerLocalizationState(): SavedMarkerLocalizationState {

	return {
		available: false
	};

}

export function createDefaultTargetGuidanceState(): TargetGuidanceState {

	return {
		visible: false,
		directionText: '',
		distanceText: '',
		detailText: '',
		alignment: 'center'
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
