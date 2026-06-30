import * as THREE from 'three';
import { loadDemoModelConfig, type DemoModelConfig } from '../load-model-ar/data/demo-model-config.js';
import {
	createMarkerPoseInArFromArjsObject,
	type MarkerPoseInAr
} from '../load-model-ar/registration/marker-pose-in-ar.js';
import {
	resolveMarkerPoseInEnu,
	solveMarkerLocalization,
	type MarkerLocalizationSolution,
	type MarkerPoseInEnu
} from '../load-model-ar/registration/marker-localization.js';
import {
	MarkerLocalizationStabilizer,
	type MarkerLocalizationStabilityReport
} from '../load-model-ar/registration/marker-localization-stabilizer.js';

const ARJS_SCRIPT_SELECTOR = 'script[data-arjs-runtime="true"]';
const ARJS_REPOSITORY = 'AR-js-org/AR.js';
const ARJS_RUNTIME_URL = '/arjs/build/ar-threex.js';
const ARJS_CAMERA_PARAMETERS_URL = '/arjs/data/camera_para.dat';
const ARJS_MARKER_PATTERN_URL = '/arjs/data/patt.focus-grid';
const ARJS_MARKER_IMAGE_URL = '/markers/focus-grid-marker.svg';
const MARKER_LOCALIZATION_STORAGE_KEY = 'loadModelAR.markerLocalization.lastStableSolution';
const DEFAULT_MARKER_ID = 'focus-grid';
const LOG_INTERVAL_MS = 250;
const MAIN_AR_PAGE_URL = '/loadModelAR.html';
const MARKER_REFERENCE_URL = ARJS_MARKER_IMAGE_URL;
const THREEX_RUNTIME_POLL_INTERVAL_MS = 100;
const THREEX_RUNTIME_TIMEOUT_MS = 8000;
const LOOP_DEBUG_LOG_INTERVAL_MS = 1000;
const ARJS_SOURCE_WIDTH = 960;
const ARJS_SOURCE_HEIGHT = 720;
const ARJS_DETECTION_CANVAS_WIDTH = 960;
const ARJS_DETECTION_CANVAS_HEIGHT = 720;
const ARJS_MAX_DETECTION_RATE = 30;
const ARJS_DEFAULT_MARKER_SIZE_METERS = 0.2;
const ARJS_MARKER_SMOOTH_ENABLED = false;
const ARJS_MARKER_SMOOTH_COUNT = 0;
const ARJS_MARKER_SMOOTH_TOLERANCE = 0;
const ARJS_MARKER_SMOOTH_THRESHOLD = 0;

const MARKER_TEST_CONFIGS = {
	dz1207: {
		configUrl: '/pipe-viewer/dz1207.config.json',
		markerConfigId: 'dike-marker-001'
	},
	'local-debug': {
		configUrl: '/pipe-viewer/company_debug_site.config.json',
		markerConfigId: 'local-debug-marker-001'
	}
} as const;

type MarkerTestConfigMode = keyof typeof MARKER_TEST_CONFIGS;

type ArToolkitSourceInstance = {
	readonly domElement: HTMLVideoElement | HTMLCanvasElement | null;
	readonly ready: boolean;
	init(onReady: () => void): void;
	onResizeElement(): void;
	copyElementSizeTo(element: Element): void;
};

type ArToolkitContextInstance = {
	init(onCompleted: () => void): void;
	getProjectionMatrix(): THREE.Matrix4;
	update(sourceElement: HTMLVideoElement | HTMLCanvasElement): void;
	arController?: {
		canvas?: HTMLCanvasElement | null;
	};
};

type ArMarkerControlsInstance = Record<string, never>;

type ArjsRuntime = {
	ArToolkitSource: new (options: {
		sourceType: 'webcam';
		sourceWidth?: number;
		sourceHeight?: number;
		displayWidth?: number;
		displayHeight?: number;
	}) => ArToolkitSourceInstance;
	ArToolkitContext: new (options: {
		cameraParametersUrl: string;
		detectionMode: 'mono';
		canvasWidth?: number;
		canvasHeight?: number;
		maxDetectionRate?: number;
	}) => ArToolkitContextInstance;
	ArMarkerControls: new (
		context: ArToolkitContextInstance,
		object3D: THREE.Object3D,
		options: {
			type: 'pattern';
			patternUrl: string;
			size?: number;
			smooth?: boolean;
			smoothCount?: number;
			smoothTolerance?: number;
			smoothThreshold?: number;
		}
	) => ArMarkerControlsInstance;
};

type ArjsNamespaceRuntime = {
	Source?: ArjsRuntime[ 'ArToolkitSource' ];
	Context?: ArjsRuntime[ 'ArToolkitContext' ];
	MarkerControls?: ArjsRuntime[ 'ArMarkerControls' ];
	ArToolkitSource?: ArjsRuntime[ 'ArToolkitSource' ];
	ArToolkitContext?: ArjsRuntime[ 'ArToolkitContext' ];
	ArMarkerControls?: ArjsRuntime[ 'ArMarkerControls' ];
};

type MarkerTestWindow = Window & typeof globalThis & {
	THREE?: typeof THREE;
	THREEx?: Partial<ArjsRuntime>;
	ARjs?: Partial<ArjsNamespaceRuntime>;
	ArMarkerControls?: ArjsRuntime[ 'ArMarkerControls' ];
};

type ArjsRuntimeDiagnostic = {
	scriptUrl: string;
	scriptLoaded: boolean;
	hasTHREEx: boolean;
	hasARjs: boolean;
	hasArToolkitSource: boolean;
	hasArToolkitContext: boolean;
	hasArMarkerControls: boolean;
	usingArjsNamespaceShim: boolean;
	usingOfficialBuild: boolean;
	repository: string;
	oldRepositoryDetected: boolean;
};

type AssetProbeState = 'idle' | 'loading' | 'loaded' | 'failed';

type AssetProbeResult = {
	ok: boolean;
	message: string;
	status: number | null;
	bytes: number;
	contentType: string;
	isHtml: boolean;
};

type SerializedStableMarkerLocalization = {
	markerId: string;
	markerConfigId: string;
	timestamp: number;
	source: 'marker';
	matrix: number[];
	siteOriginArPosition: { x: number; y: number; z: number };
	headingDeg: number;
	rmsErrorMeters: number;
	sampleCount: number;
	stabilityReport: ReturnType<typeof serializeStabilityReport>;
};

const viewportElement = getRequiredElement<HTMLDivElement>( 'marker-test-viewport' );
const cameraPreviewElement = getRequiredElement<HTMLDivElement>( 'marker-camera-preview' );
const statusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-status' );
const summaryStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-summary-status' );
const summaryConfigModeElement = getRequiredElement<HTMLSpanElement>( 'marker-test-summary-config-mode' );
const summaryMarkerConfigIdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-summary-marker-config-id' );
const summaryVisibleElement = getRequiredElement<HTMLSpanElement>( 'marker-test-summary-visible' );
const summaryStableElement = getRequiredElement<HTMLSpanElement>( 'marker-test-summary-stable' );
const debugDrawerElement = getRequiredElement<HTMLElement>( 'marker-test-debug-drawer' );
const toggleDebugButton = getRequiredElement<HTMLButtonElement>( 'marker-test-toggle-debug' );
const guideFrameElement = getRequiredElement<HTMLDivElement>( 'marker-test-guide-frame' );
const guideLabelElement = getRequiredElement<HTMLDivElement>( 'marker-test-guide-label' );
const configModeElement = getRequiredElement<HTMLSpanElement>( 'marker-test-config-mode' );
const configUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-config-url' );
const markerConfigIdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-config-id' );
const markerIdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-id' );
const cameraParamUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-camera-param-url' );
const patternUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-pattern-url' );
const arjsBuildUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-arjs-build-url' );
const arjsBuildStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-arjs-build-status' );
const markerImageUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-image-url' );
const markerImageStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-image-status' );
const repositoryElement = getRequiredElement<HTMLSpanElement>( 'marker-test-repository' );
const oldRepoDetectedElement = getRequiredElement<HTMLSpanElement>( 'marker-test-old-repo-detected' );
const cameraParamStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-camera-param-status' );
const patternStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-pattern-status' );
const rawDetectionElement = getRequiredElement<HTMLSpanElement>( 'marker-test-raw-detection' );
const engineeringLocalizationElement = getRequiredElement<HTMLSpanElement>( 'marker-test-engineering-localization' );
const warningElement = getRequiredElement<HTMLDivElement>( 'marker-test-warning' );
const hasVideoElementElement = getRequiredElement<HTMLSpanElement>( 'marker-test-has-video-element' );
const videoReadyStateElement = getRequiredElement<HTMLSpanElement>( 'marker-test-video-ready-state' );
const videoSizeElement = getRequiredElement<HTMLSpanElement>( 'marker-test-video-size' );
const arToolkitSourceReadyElement = getRequiredElement<HTMLSpanElement>( 'marker-test-ar-source-ready' );
const arToolkitSourceDomExistsElement = getRequiredElement<HTMLSpanElement>( 'marker-test-ar-source-dom-exists' );
const arToolkitContextReadyElement = getRequiredElement<HTMLSpanElement>( 'marker-test-ar-context-ready' );
const markerControlsReadyElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-controls-ready' );
const renderLoopRunningElement = getRequiredElement<HTMLSpanElement>( 'marker-test-render-loop-running' );
const frameCountElement = getRequiredElement<HTMLSpanElement>( 'marker-test-frame-count' );
const lastFrameTimestampElement = getRequiredElement<HTMLSpanElement>( 'marker-test-last-frame-timestamp' );
const lastArToolkitUpdateTimestampElement = getRequiredElement<HTMLSpanElement>( 'marker-test-last-ar-update-timestamp' );
const markerRootVisibleElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-root-visible' );
const markerRootMatrixWorldElement = getRequiredElement<HTMLPreElement>( 'marker-test-marker-root-matrix-world' );
const visibleElement = getRequiredElement<HTMLSpanElement>( 'marker-test-visible' );
const positionElement = getRequiredElement<HTMLSpanElement>( 'marker-test-position' );
const quaternionElement = getRequiredElement<HTMLSpanElement>( 'marker-test-quaternion' );
const matrixElement = getRequiredElement<HTMLPreElement>( 'marker-test-matrix' );
const timestampElement = getRequiredElement<HTMLSpanElement>( 'marker-test-timestamp' );
const localizationAvailableElement = getRequiredElement<HTMLSpanElement>( 'marker-test-localization-available' );
const correspondenceCountElement = getRequiredElement<HTMLSpanElement>( 'marker-test-correspondence-count' );
const rmsErrorElement = getRequiredElement<HTMLSpanElement>( 'marker-test-rms-error' );
const siteOriginArPositionElement = getRequiredElement<HTMLSpanElement>( 'marker-test-site-origin-ar-position' );
const headingDegElement = getRequiredElement<HTMLSpanElement>( 'marker-test-heading-deg' );
const localizationSourceElement = getRequiredElement<HTMLSpanElement>( 'marker-test-localization-source' );
const localizationMatrixElement = getRequiredElement<HTMLPreElement>( 'marker-test-localization-matrix' );
const stabilitySampleCountElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-sample-count' );
const stabilityStateElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-state' );
const stabilityAverageRmsElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-average-rms' );
const stabilityPositionStdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-position-std' );
const stabilityHeadingStdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-heading-std' );
const stabilityAveragedPositionElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-averaged-position' );
const stabilityAveragedHeadingElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-averaged-heading' );
const stabilityReasonElement = getRequiredElement<HTMLSpanElement>( 'marker-test-stability-reason' );
const saveStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-save-status' );
const backToArButton = getRequiredElement<HTMLButtonElement>( 'marker-test-back-to-ar' );
const showMarkerReferenceButton = getRequiredElement<HTMLButtonElement>( 'marker-test-show-marker-reference' );
const resetSamplesButton = getRequiredElement<HTMLButtonElement>( 'marker-test-reset-samples' );
const saveStableButton = getRequiredElement<HTMLButtonElement>( 'marker-test-save-stable' );

const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const localizationStabilizer = new MarkerLocalizationStabilizer();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.Camera | null = null;
let markerRoot: THREE.Group | null = null;
let arToolkitSource: ArToolkitSourceInstance | null = null;
let arToolkitContext: ArToolkitContextInstance | null = null;
let markerControls: ArMarkerControlsInstance | null = null;
let lastVisible = false;
let lastLoggedAt = 0;
let lastLoopLogAt = 0;
let animationFrameId = 0;
let demoModelConfig: DemoModelConfig | null = null;
let markerPoseInEnu: MarkerPoseInEnu | null = null;
let arToolkitSourceReady = false;
let arToolkitContextReady = false;
let markerControlsReady = false;
let renderLoopRunning = false;
let frameCount = 0;
let lastFrameTimestamp: number | null = null;
let lastArToolkitUpdateTimestamp: number | null = null;
let markerRootVisible = false;
let contextUpdatedCount = 0;
let arjsBuildStatus: AssetProbeState = 'idle';
let cameraParamStatus: AssetProbeState = 'idle';
let patternStatus: AssetProbeState = 'idle';
let markerImageStatus: AssetProbeState = 'idle';
let debugDrawerOpen = false;
const currentConfigMode = resolveConfigMode();
const currentConfigDefinition = MARKER_TEST_CONFIGS[ currentConfigMode ];

markerIdElement.textContent = DEFAULT_MARKER_ID;
configModeElement.textContent = currentConfigMode;
summaryConfigModeElement.textContent = currentConfigMode;
configUrlElement.textContent = currentConfigDefinition.configUrl;
markerConfigIdElement.textContent = mapMarkerIdToConfigMarkerId( DEFAULT_MARKER_ID );
summaryMarkerConfigIdElement.textContent = mapMarkerIdToConfigMarkerId( DEFAULT_MARKER_ID );
arjsBuildUrlElement.textContent = ARJS_RUNTIME_URL;
cameraParamUrlElement.textContent = ARJS_CAMERA_PARAMETERS_URL;
patternUrlElement.textContent = ARJS_MARKER_PATTERN_URL;
markerImageUrlElement.textContent = ARJS_MARKER_IMAGE_URL;
repositoryElement.textContent = ARJS_REPOSITORY;
oldRepoDetectedElement.textContent = detectDeprecatedRepositoryPath() ? 'yes' : 'no';
setStatus( 'Loading AR.js runtime, marker config, and stabilizer...' );
setPoseState( null, false );
setLocalizationState( null, false );
setStabilityState( localizationStabilizer.getReport() );
setSaveStatus( 'Current saved result is for debug only and is not connected to the main WebXR AR flow.' );
syncDebugState();

backToArButton.addEventListener( 'click', handleBackToAr );
showMarkerReferenceButton.addEventListener( 'click', handleShowMarkerReference );
toggleDebugButton.addEventListener( 'click', handleToggleDebugDrawer );
resetSamplesButton.addEventListener( 'click', handleResetSamples );
saveStableButton.addEventListener( 'click', handleSaveStableResult );

void boot();

async function boot(): Promise<void> {

	try {
		exposeThreeGlobal();
		await probeMarkerAssets();

		const [ runtime, config ] = await Promise.all( [
			loadArjsRuntime(),
			loadDemoModelConfig( currentConfigDefinition.configUrl, () => undefined )
		] );

		demoModelConfig = config;
		markerPoseInEnu = resolveMarkerPoseInEnu( config, mapMarkerIdToConfigMarkerId( DEFAULT_MARKER_ID ) );
		initializeSceneRuntime();
		setStatus( 'Opening camera...' );
		setupArjsScene( runtime );
		startLoop();
	} catch ( error ) {
		console.error( 'Marker test boot failed:', error );
		setStatus( error instanceof Error ? error.message : 'Marker test boot failed.' );
	}

}

function setupArjsScene(runtime: ArjsRuntime): void {

	if ( camera === null || markerRoot === null ) {
		throw new Error( 'Scene runtime is not initialized.' );
	}

	arToolkitSource = new runtime.ArToolkitSource( {
		sourceType: 'webcam',
		sourceWidth: ARJS_SOURCE_WIDTH,
		sourceHeight: ARJS_SOURCE_HEIGHT,
		displayWidth: window.innerWidth,
		displayHeight: window.innerHeight
	} );
	arToolkitContext = new runtime.ArToolkitContext( {
		cameraParametersUrl: ARJS_CAMERA_PARAMETERS_URL,
		detectionMode: 'mono',
		canvasWidth: ARJS_DETECTION_CANVAS_WIDTH,
		canvasHeight: ARJS_DETECTION_CANVAS_HEIGHT,
		maxDetectionRate: ARJS_MAX_DETECTION_RATE
	} );
	logArjsMarkerAssets();

	arToolkitSource.init( () => {
		arToolkitSourceReady = true;
		syncDebugState();
		logArjsMarkerAssets();
		logArjsRuntimeReady();
		ensureCameraPreviewAttached();
		handleResize();
		setStatus( 'Camera ready. Point the device at the marker.' );
	} );

	arToolkitContext.init( () => {
		arToolkitContextReady = true;
		syncDebugState();
		logArjsMarkerAssets();
		logArjsRuntimeReady();
		camera?.projectionMatrix.copy( arToolkitContext?.getProjectionMatrix() ?? new THREE.Matrix4() );
	} );

	markerControls = new runtime.ArMarkerControls(
		arToolkitContext,
		markerRoot,
		{
			type: 'pattern',
			patternUrl: ARJS_MARKER_PATTERN_URL,
			size: getConfiguredMarkerSizeMeters(),
			smooth: ARJS_MARKER_SMOOTH_ENABLED,
			smoothCount: ARJS_MARKER_SMOOTH_COUNT,
			smoothTolerance: ARJS_MARKER_SMOOTH_TOLERANCE,
			smoothThreshold: ARJS_MARKER_SMOOTH_THRESHOLD
		}
	);
	markerControlsReady = markerControls !== null;
	syncDebugState();
	logArjsMarkerAssets();
	logArjsRuntimeReady();

	window.addEventListener( 'resize', handleResize );

}

function startLoop(): void {

	const tick = (): void => {

		animationFrameId = window.requestAnimationFrame( tick );
		frameCount += 1;
		renderLoopRunning = true;
		lastFrameTimestamp = Date.now();

		const sourceReady = Boolean( arToolkitSource?.ready );
		const sourceElement = arToolkitSource?.domElement ?? null;
		const hasDomElement = Boolean( sourceElement );
		const contextReady = Boolean( arToolkitContext );
		const controlsReady = Boolean( markerControls );
		markerControlsReady = controlsReady;

		if ( sourceReady && hasDomElement && contextReady && sourceElement !== null && arToolkitContext !== null ) {
			arToolkitContext.update( sourceElement );
			lastArToolkitUpdateTimestamp = Date.now();
			contextUpdatedCount += 1;
		}

		const visible = Boolean( markerRoot?.visible );
		markerRootVisible = visible;
		updateVisibleState( visible ? 'visible' : 'lost' );

		if ( visible && markerRoot !== null ) {
			markerRoot.updateMatrixWorld( true );

			const markerPoseInAr = createMarkerPoseInArFromArjsObject( {
				markerId: DEFAULT_MARKER_ID,
				object3D: markerRoot,
				timestamp: Date.now()
			} );
			const shouldLog = lastVisible === false || markerPoseInAr.timestamp - lastLoggedAt >= LOG_INTERVAL_MS;

			if ( shouldLog ) {
				logMarkerPose( markerPoseInAr );
				lastLoggedAt = markerPoseInAr.timestamp;
			}

			lastVisible = true;
			setPoseState( markerPoseInAr, true );
			resolveMarkerLocalizationDebug( markerPoseInAr, shouldLog );
		} else {
			if ( lastVisible ) {
				console.info( '[ArjsMarkerTracking]', {
					markerId: DEFAULT_MARKER_ID,
					visible: false,
					matrix: null,
					position: null,
					quaternion: null,
					timestamp: Date.now()
				} );
			}

			lastVisible = false;
			setPoseState( null, false );
			setLocalizationState( null, false );
			setStabilityState( localizationStabilizer.getReport() );
		}

		if ( renderer !== null && scene !== null && camera !== null ) {
			renderer.render( scene, camera );
		}

		syncDebugState();
		maybeLogArjsLoop();

	};

	tick();

}

function resolveMarkerLocalizationDebug(
	currentMarkerPoseInAr: MarkerPoseInAr,
	shouldLog: boolean
): void {

	if ( demoModelConfig === null || markerPoseInEnu === null ) {
		setLocalizationState( null, false );
		setStabilityState( localizationStabilizer.getReport() );
		return;
	}

	try {
		const localization = solveMarkerLocalization( {
			markerId: currentMarkerPoseInAr.markerId,
			markerPoseInEnu,
			markerPoseInAr: currentMarkerPoseInAr
		} );
		const stabilityReport = localizationStabilizer.addSample( localization );

		setLocalizationState( localization, true );
		setStabilityState( stabilityReport );

		if ( shouldLog ) {
			console.info( '[MarkerLocalizationDebug]', {
				markerId: currentMarkerPoseInAr.markerId,
				markerPoseInEnu,
				markerPoseInAr: currentMarkerPoseInAr,
				rmsErrorMeters: localization.rmsErrorMeters,
				siteOriginArPosition: localization.siteOriginArPosition,
				headingDeg: localization.headingDeg,
				matrix: localization.matrix
			} );
			console.info( '[MarkerLocalizationStability]', {
				stable: stabilityReport.stable,
				sampleCount: stabilityReport.sampleCount,
				averageRmsErrorMeters: stabilityReport.averageRmsErrorMeters,
				positionStdMeters: stabilityReport.positionStdMeters,
				headingStdDeg: stabilityReport.headingStdDeg,
				reason: stabilityReport.reason
			} );
		}
	} catch ( error ) {
		console.error( '[MarkerLocalizationDebug] failed:', error );
		setLocalizationState( null, false );
		setStabilityState( localizationStabilizer.getReport() );
	}

}

function updateVisibleState(state: 'visible' | 'lost'): void {

	const visible = state === 'visible';
	visibleElement.textContent = state;
	rawDetectionElement.textContent = state;
	summaryVisibleElement.textContent = state;
	guideFrameElement.classList.toggle( 'marker-test__guide--detected', visible );
	guideLabelElement.textContent = visible ? 'Marker detected' : 'Place the marker inside frame';

}

function handleResetSamples(): void {

	localizationStabilizer.reset();
	setStabilityState( localizationStabilizer.getReport() );
	setSaveStatus( 'Sampling reset. Current saved result is still debug-only and not connected to main WebXR.' );
	setStatus( 'Marker localization samples reset.' );

}

function handleBackToAr(): void {

	window.location.assign( MAIN_AR_PAGE_URL );

}

function handleShowMarkerReference(): void {

	window.open( MARKER_REFERENCE_URL, '_blank', 'noopener,noreferrer' );

}

function handleToggleDebugDrawer(): void {

	debugDrawerOpen = !debugDrawerOpen;
	debugDrawerElement.hidden = !debugDrawerOpen;
	toggleDebugButton.textContent = debugDrawerOpen ? 'Hide Debug' : 'Debug';

}

function handleSaveStableResult(): void {

	const report = localizationStabilizer.getReport();
	setStabilityState( report );

	if ( report.stable === false || report.latestSolution === undefined || markerPoseInEnu === null ) {
		setSaveStatus( 'Current localization is not stable enough to save.' );
		return;
	}

	const latestSolution = report.latestSolution;
	const payload: SerializedStableMarkerLocalization = {
		markerId: DEFAULT_MARKER_ID,
		markerConfigId: markerPoseInEnu.markerId,
		timestamp: latestSolution.arFromEnuSolution.timestamp,
		source: 'marker',
		matrix: latestSolution.matrix.elements.slice(),
		siteOriginArPosition: vectorToPlainObject( latestSolution.siteOriginArPosition ),
		headingDeg: latestSolution.headingDeg,
		rmsErrorMeters: latestSolution.rmsErrorMeters,
		sampleCount: report.sampleCount,
		stabilityReport: serializeStabilityReport( report )
	};

	/* This debug save stays local to marker-test and does not affect main WebXR. */
	window.localStorage.setItem(
		MARKER_LOCALIZATION_STORAGE_KEY,
		JSON.stringify( payload )
	);

	console.info( '[MarkerLocalizationSaved]', {
		markerId: payload.markerId,
		timestamp: payload.timestamp,
		matrix: payload.matrix,
		siteOriginArPosition: payload.siteOriginArPosition,
		headingDeg: payload.headingDeg
	} );

	setSaveStatus( `Stable marker localization saved to localStorage key ${MARKER_LOCALIZATION_STORAGE_KEY}.` );

}

function setPoseState(markerPoseInArValue: MarkerPoseInAr | null, visible: boolean): void {

	if ( markerPoseInArValue === null ) {
		positionElement.textContent = '-';
		quaternionElement.textContent = '-';
		matrixElement.textContent = '-';
		timestampElement.textContent = '-';
		return;
	}

	markerPoseInArValue.matrix.decompose( tempPosition, tempQuaternion, tempScale );

	positionElement.textContent = formatVector3( tempPosition );
	quaternionElement.textContent = formatQuaternion( tempQuaternion );
	matrixElement.textContent = formatMatrix4( markerPoseInArValue.matrix );
	timestampElement.textContent = new Date( markerPoseInArValue.timestamp ).toLocaleString( 'zh-CN', {
		hour12: false
	} );

}

function setLocalizationState(
	localization: MarkerLocalizationSolution | null,
	available: boolean
): void {

	localizationAvailableElement.textContent = available ? 'available' : 'unavailable';
	engineeringLocalizationElement.textContent = available ? 'available' : 'unavailable';

	if ( localization === null ) {
		correspondenceCountElement.textContent = '-';
		rmsErrorElement.textContent = '-';
		siteOriginArPositionElement.textContent = '-';
		headingDegElement.textContent = '-';
		localizationSourceElement.textContent = '-';
		localizationMatrixElement.textContent = '-';
		return;
	}

	correspondenceCountElement.textContent = `${localization.correspondenceCount}`;
	rmsErrorElement.textContent = localization.rmsErrorMeters.toFixed( 6 );
	siteOriginArPositionElement.textContent = formatVector3( localization.siteOriginArPosition );
	headingDegElement.textContent = localization.headingDeg.toFixed( 4 );
	localizationSourceElement.textContent = localization.source;
	localizationMatrixElement.textContent = formatMatrix4( localization.matrix );

}

function setStabilityState(report: MarkerLocalizationStabilityReport): void {

	stabilitySampleCountElement.textContent = `${report.sampleCount}`;
	stabilityStateElement.textContent = report.stable ? 'stable' : 'unstable';
	summaryStableElement.textContent = report.stable ? 'stable' : 'unstable';
	stabilityAverageRmsElement.textContent = formatOptionalNumber( report.averageRmsErrorMeters, 6 );
	stabilityPositionStdElement.textContent = formatOptionalNumber( report.positionStdMeters, 6 );
	stabilityHeadingStdElement.textContent = formatOptionalNumber( report.headingStdDeg, 4 );
	stabilityAveragedPositionElement.textContent = report.averagedSiteOriginArPosition === undefined
		? '-'
		: `${report.averagedSiteOriginArPosition.x.toFixed( 4 )}, ${report.averagedSiteOriginArPosition.y.toFixed( 4 )}, ${report.averagedSiteOriginArPosition.z.toFixed( 4 )}`;
	stabilityAveragedHeadingElement.textContent = formatOptionalNumber( report.averagedHeadingDeg, 4 );
	stabilityReasonElement.textContent = report.reason ?? '-';
	saveStableButton.disabled = report.stable === false;

}

function setSaveStatus(message: string): void {

	saveStatusElement.textContent = message;

}

function syncDebugState(): void {

	const videoElement = getCurrentPreviewVideoElement();
	const sourceDomElementExists = arToolkitSource?.domElement !== null && arToolkitSource?.domElement !== undefined;
	const videoReadyState = videoElement?.readyState ?? null;
	const videoWidth = videoElement?.videoWidth ?? 0;
	const videoHeight = videoElement?.videoHeight ?? 0;
	const showVideoWarning = videoElement !== null && ( videoReadyState < 2 || videoWidth === 0 || videoHeight === 0 );
	hasVideoElementElement.textContent = videoElement === null ? 'no' : 'yes';
	videoReadyStateElement.textContent = videoElement === null
		? '-'
		: `${videoReadyState}`;
	videoSizeElement.textContent = videoElement === null
		? '-'
		: `${videoWidth} / ${videoHeight}`;
	arToolkitSourceReadyElement.textContent = arToolkitSourceReady ? 'yes' : 'no';
	arToolkitSourceDomExistsElement.textContent = sourceDomElementExists ? 'yes' : 'no';
	arToolkitContextReadyElement.textContent = arToolkitContextReady ? 'yes' : 'no';
	markerControlsReadyElement.textContent = markerControlsReady ? 'yes' : 'no';
	arjsBuildStatusElement.textContent = arjsBuildStatus;
	cameraParamStatusElement.textContent = cameraParamStatus;
	patternStatusElement.textContent = patternStatus;
	markerImageStatusElement.textContent = markerImageStatus;
	oldRepoDetectedElement.textContent = detectDeprecatedRepositoryPath() ? 'yes' : 'no';
	renderLoopRunningElement.textContent = renderLoopRunning ? 'yes' : 'no';
	frameCountElement.textContent = `${frameCount}`;
	lastFrameTimestampElement.textContent = lastFrameTimestamp === null
		? '-'
		: new Date( lastFrameTimestamp ).toLocaleTimeString( 'zh-CN', { hour12: false } );
	lastArToolkitUpdateTimestampElement.textContent = lastArToolkitUpdateTimestamp === null
		? '-'
		: new Date( lastArToolkitUpdateTimestamp ).toLocaleTimeString( 'zh-CN', { hour12: false } );
	markerRootVisibleElement.textContent = markerRootVisible ? 'yes' : 'no';
	markerRootMatrixWorldElement.textContent = markerRoot === null
		? '-'
		: formatMatrix4( markerRoot.matrixWorld );
	warningElement.hidden = !showVideoWarning;

}

function logMarkerPose(markerPoseInArValue: MarkerPoseInAr): void {

	markerPoseInArValue.matrix.decompose( tempPosition, tempQuaternion, tempScale );

	console.info( '[ArjsMarkerTracking]', {
		markerId: markerPoseInArValue.markerId,
		visible: true,
		matrix: markerPoseInArValue.matrix,
		position: tempPosition.clone(),
		quaternion: tempQuaternion.clone(),
		timestamp: markerPoseInArValue.timestamp
	} );

}

function logMarkerCameraPreview(): void {

	const videoElement = getCurrentPreviewVideoElement();
	const sourceElement = resolveCameraPreviewElement();
	console.info( '[MarkerCameraPreview]', {
		hasVideoElement: videoElement !== null,
		videoParent: videoElement?.parentElement?.id ?? videoElement?.parentElement?.tagName ?? null,
		videoWidth: videoElement?.videoWidth ?? 0,
		videoHeight: videoElement?.videoHeight ?? 0,
		videoReadyState: videoElement?.readyState ?? null,
		videoStyle: videoElement === null
			? null
			: {
				position: videoElement.style.position,
				inset: videoElement.style.inset,
				width: videoElement.style.width,
				height: videoElement.style.height,
				objectFit: videoElement.style.objectFit,
				zIndex: videoElement.style.zIndex,
				background: videoElement.style.background
			},
		rendererCanvasAttached: renderer?.domElement.parentElement === viewportElement,
		sourceElementTag: sourceElement?.tagName ?? null
	} );

}

function logArjsMarkerAssets(): void {

	console.info( '[ArjsMarkerAssets]', {
		arjsBuildUrl: ARJS_RUNTIME_URL,
		cameraParamUrl: ARJS_CAMERA_PARAMETERS_URL,
		patternUrl: ARJS_MARKER_PATTERN_URL,
		markerImageUrl: ARJS_MARKER_IMAGE_URL,
		sourceWidth: ARJS_SOURCE_WIDTH,
		sourceHeight: ARJS_SOURCE_HEIGHT,
		detectionCanvasWidth: ARJS_DETECTION_CANVAS_WIDTH,
		detectionCanvasHeight: ARJS_DETECTION_CANVAS_HEIGHT,
		maxDetectionRate: ARJS_MAX_DETECTION_RATE,
		markerSizeMeters: getConfiguredMarkerSizeMeters(),
		markerSmoothing: {
			enabled: ARJS_MARKER_SMOOTH_ENABLED,
			smoothCount: ARJS_MARKER_SMOOTH_COUNT,
			smoothTolerance: ARJS_MARKER_SMOOTH_TOLERANCE,
			smoothThreshold: ARJS_MARKER_SMOOTH_THRESHOLD
		},
		arToolkitSourceReady,
		arToolkitContextReady,
		markerControlsReady,
		arjsBuildStatus,
		cameraParamStatus,
		patternStatus,
		markerImageStatus
	} );

}

function logOfficialAssetCheck(results: {
	buildResult: AssetProbeResult;
	cameraParamResult: AssetProbeResult;
	patternResult: AssetProbeResult;
	markerImageResult: AssetProbeResult;
}): void {

	console.info( '[ArjsOfficialAssetCheck]', {
		arjsBuildUrl: ARJS_RUNTIME_URL,
		arjsBuildStatus,
		buildBytes: results.buildResult.bytes,
		cameraParametersUrl: ARJS_CAMERA_PARAMETERS_URL,
		cameraStatus: cameraParamStatus,
		cameraBytes: results.cameraParamResult.bytes,
		patternUrl: ARJS_MARKER_PATTERN_URL,
		patternStatus,
		patternBytes: results.patternResult.bytes,
		markerImageUrl: ARJS_MARKER_IMAGE_URL,
		markerImageStatus,
		markerImageBytes: results.markerImageResult.bytes,
		repository: ARJS_REPOSITORY,
		oldRepositoryDetected: detectDeprecatedRepositoryPath()
	} );

}

function maybeLogArjsLoop(): void {

	const now = Date.now();
	if ( now - lastLoopLogAt < LOOP_DEBUG_LOG_INTERVAL_MS ) {
		return;
	}

	lastLoopLogAt = now;
	const videoElement = getCurrentPreviewVideoElement();
	console.info( '[MarkerFrameDebug]', {
		frameCount,
		sourceReady: arToolkitSourceReady,
		videoWidth: videoElement?.videoWidth ?? 0,
		videoHeight: videoElement?.videoHeight ?? 0,
		markerVisible: markerRootVisible,
		contextUpdatedCount,
		markerRootVisible,
		markerRootMatrixWorld: markerRoot?.matrixWorld ?? null
	} );
	console.info( '[ArjsTrackingLoop]', {
		frameCount,
		arToolkitSourceReady,
		hasSourceDomElement: arToolkitSource?.domElement !== null && arToolkitSource?.domElement !== undefined,
		videoReadyState: videoElement?.readyState ?? null,
		videoWidth: videoElement?.videoWidth ?? 0,
		videoHeight: videoElement?.videoHeight ?? 0,
		arToolkitContextReady,
		markerControlsReady,
		markerRootVisible,
		lastArToolkitUpdateTimestamp
	} );

}

function handleResize(): void {

	if ( renderer === null ) {
		return;
	}

	renderer.setSize( window.innerWidth, window.innerHeight );

	if ( arToolkitSource === null ) {
		return;
	}

	arToolkitSource.onResizeElement();
	arToolkitSource.copyElementSizeTo( renderer.domElement );
	if ( arToolkitContext?.arController?.canvas instanceof HTMLCanvasElement ) {
		arToolkitSource.copyElementSizeTo( arToolkitContext.arController.canvas );
	}
	ensureCameraPreviewAttached();
	syncDebugState();
	logMarkerCameraPreview();

	const canvas = renderer.domElement;
	canvas.style.position = 'fixed';
	canvas.style.inset = '0';
	canvas.style.width = '100vw';
	canvas.style.height = '100vh';
	canvas.style.zIndex = '1';
	canvas.style.pointerEvents = 'none';
	logMarkerResize();

}

function getCurrentPreviewVideoElement(): HTMLVideoElement | null {

	const sourceElement = resolveCameraPreviewElement();
	if ( sourceElement instanceof HTMLVideoElement ) {
		return sourceElement;
	}

	const previewVideo = cameraPreviewElement.querySelector( 'video' );
	return previewVideo instanceof HTMLVideoElement ? previewVideo : null;

}

function resolveCameraPreviewElement(): HTMLVideoElement | HTMLCanvasElement | null {

	const sourceElement = arToolkitSource?.domElement ?? null;
	if ( sourceElement instanceof HTMLVideoElement || sourceElement instanceof HTMLCanvasElement ) {
		return sourceElement;
	}

	const previewVideo = cameraPreviewElement.querySelector( 'video' );
	if ( previewVideo instanceof HTMLVideoElement ) {
		return previewVideo;
	}

	const previewCanvas = cameraPreviewElement.querySelector( 'canvas' );
	return previewCanvas instanceof HTMLCanvasElement ? previewCanvas : null;

}

function ensureCameraPreviewAttached(retryCount = 0): void {

	const sourceElement = resolveCameraPreviewElement();
	if ( sourceElement === null ) {
		setStatus( 'Camera video element is not ready yet.' );
		console.warn( '[MarkerCameraPreview]', {
			hasVideoElement: false,
			reason: 'arToolkitSource.domElement is null',
			retryCount
		} );

		if ( retryCount < 10 ) {
			window.setTimeout( () => {
				ensureCameraPreviewAttached( retryCount + 1 );
			}, 120 );
		}

		return;
	}

	attachCameraPreview( sourceElement );
	logMarkerCameraPreview();

}

async function loadArjsRuntime(): Promise<ArjsRuntime> {

	exposeThreeGlobal();

	const existingScript = document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR );
	if ( existingScript !== null && isOfficialArjsBuildUrl( existingScript.src ) === false ) {
		console.warn( '[ArjsRuntime]', {
			message: 'Detected deprecated AR.js repository path. Replacing runtime with local official build.',
			scriptUrl: existingScript.src
		} );
		existingScript.remove();
		delete ( window as MarkerTestWindow ).THREEx;
	}

	const existingRuntime = readArjsRuntime();
	if ( existingRuntime !== null && isOfficialArjsBuildUrl( document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR )?.src ?? ARJS_RUNTIME_URL ) ) {
		logArjsRuntime( readArjsRuntimeDiagnostic( true ) );
		return existingRuntime;
	}

	const retainedScript = document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR );
	if ( retainedScript !== null ) {
		if ( retainedScript.dataset.loaded !== 'true' ) {
			await waitForScriptLoad( retainedScript );
		}

		const existingRuntimeAfterLoad = await waitForThreexRuntime( 600 );
		if ( existingRuntimeAfterLoad !== null ) {
			return existingRuntimeAfterLoad;
		}

		retainedScript.remove();
	}

	const script = document.createElement( 'script' );
	script.async = true;
	script.dataset.arjsRuntime = 'true';
	script.src = ARJS_RUNTIME_URL;
	document.head.appendChild( script );
	await waitForScriptLoad( script );

	const runtime = await waitForThreexRuntime();
	if ( runtime === null ) {
		throw createThreexUnavailableError( readArjsRuntimeDiagnostic( true ) );
	}

	return runtime;

}

function readArjsRuntime(): ArjsRuntime | null {

	installArjsRuntimeShim();

	const candidate = ( window as MarkerTestWindow ).THREEx;
	if ( candidate === undefined ) {
		return null;
	}

	if (
		typeof candidate.ArToolkitSource !== 'function'
		|| typeof candidate.ArToolkitContext !== 'function'
		|| typeof candidate.ArMarkerControls !== 'function'
	) {
		return null;
	}

	return candidate as ArjsRuntime;

}

function installArjsRuntimeShim(): void {

	const markerWindow = window as MarkerTestWindow;
	const currentRuntime = markerWindow.THREEx;
	if (
		typeof currentRuntime?.ArToolkitSource === 'function'
		&& typeof currentRuntime?.ArToolkitContext === 'function'
		&& typeof currentRuntime?.ArMarkerControls === 'function'
	) {
		return;
	}

	const arjsRuntime = markerWindow.ARjs;
	const sourceCtor = resolveRuntimeConstructor<ArjsRuntime[ 'ArToolkitSource' ]>(
		currentRuntime?.ArToolkitSource,
		arjsRuntime?.Source,
		arjsRuntime?.ArToolkitSource
	);
	const contextCtor = resolveRuntimeConstructor<ArjsRuntime[ 'ArToolkitContext' ]>(
		currentRuntime?.ArToolkitContext,
		arjsRuntime?.Context,
		arjsRuntime?.ArToolkitContext
	);
	const markerControlsCtor = resolveRuntimeConstructor<ArjsRuntime[ 'ArMarkerControls' ]>(
		currentRuntime?.ArMarkerControls,
		arjsRuntime?.MarkerControls,
		arjsRuntime?.ArMarkerControls,
		markerWindow.ArMarkerControls
	);

	if ( sourceCtor === null || contextCtor === null || markerControlsCtor === null ) {
		return;
	}

	markerWindow.THREEx = {
		...( currentRuntime ?? {} ),
		ArToolkitSource: sourceCtor,
		ArToolkitContext: contextCtor,
		ArMarkerControls: markerControlsCtor
	};

}

function resolveRuntimeConstructor<T extends Function>(...candidates: unknown[]): T | null {

	for ( const candidate of candidates ) {
		if ( typeof candidate === 'function' ) {
			return candidate as T;
		}
	}

	return null;

}

async function waitForThreexRuntime(timeoutMs = THREEX_RUNTIME_TIMEOUT_MS): Promise<ArjsRuntime | null> {

	const startedAt = Date.now();

	while ( Date.now() - startedAt <= timeoutMs ) {
		const runtime = readArjsRuntime();
		if ( runtime !== null ) {
			logArjsRuntime( readArjsRuntimeDiagnostic( true ) );
			return runtime;
		}

		await delay( THREEX_RUNTIME_POLL_INTERVAL_MS );
	}

	const diagnostic = readArjsRuntimeDiagnostic( true );
	logArjsRuntime( diagnostic );
	return null;

}

function waitForScriptLoad(script: HTMLScriptElement): Promise<void> {

	if ( script.dataset.loaded === 'true' ) {
		logArjsRuntime( readArjsRuntimeDiagnostic( true ) );
		return Promise.resolve();
	}

	return new Promise<void>( ( resolve, reject ) => {
		const handleLoad = () => {
			script.dataset.loaded = 'true';
			logArjsRuntime( readArjsRuntimeDiagnostic( true ) );
			cleanup();
			resolve();
		};
		const handleError = () => {
			const diagnostic = readArjsRuntimeDiagnostic( false );
			logArjsRuntime( diagnostic );
			cleanup();
			reject( new Error( `AR.js runtime script load failed: ${script.src}` ) );
		};
		const cleanup = () => {
			script.removeEventListener( 'load', handleLoad );
			script.removeEventListener( 'error', handleError );
		};

		script.addEventListener( 'load', handleLoad );
		script.addEventListener( 'error', handleError );
	} );

}

async function probeMarkerAssets(): Promise<void> {

	arjsBuildStatus = 'loading';
	cameraParamStatus = 'loading';
	patternStatus = 'loading';
	markerImageStatus = 'loading';
	syncDebugState();
	logArjsMarkerAssets();

	const [ buildResult, cameraParamResult, patternResult, markerImageResult ] = await Promise.all( [
		probeAssetUrl( ARJS_RUNTIME_URL, 'text' ),
		probeAssetUrl( ARJS_CAMERA_PARAMETERS_URL, 'text' ),
		probeAssetUrl( ARJS_MARKER_PATTERN_URL, 'text' ),
		probeAssetUrl( ARJS_MARKER_IMAGE_URL, 'binary' )
	] );

	arjsBuildStatus = buildResult.ok ? 'loaded' : 'failed';
	cameraParamStatus = cameraParamResult.ok ? 'loaded' : 'failed';
	patternStatus = patternResult.ok ? 'loaded' : 'failed';
	markerImageStatus = markerImageResult.ok ? 'loaded' : 'failed';
	syncDebugState();
	logOfficialAssetCheck( {
		buildResult,
		cameraParamResult,
		patternResult,
		markerImageResult
	} );
	logArjsMarkerAssets();

	if ( buildResult.ok === false ) {
		throw new Error( `ar.js build load failed: ${buildResult.message}` );
	}

	if ( cameraParamResult.ok === false ) {
		throw new Error( `camera_para.dat load failed: ${cameraParamResult.message}` );
	}

	if ( patternResult.ok === false ) {
		throw new Error( `focus-grid pattern load failed: ${patternResult.message}` );
	}

	if ( markerImageResult.ok === false ) {
		throw new Error( `focus-grid marker image load failed: ${markerImageResult.message}` );
	}

}

async function probeAssetUrl(url: string, mode: 'text' | 'binary'): Promise<AssetProbeResult> {

	try {
		const response = await fetch( url, {
			method: 'GET',
			cache: 'no-cache'
		} );
		if ( response.ok === false ) {
			return {
				ok: false,
				message: `HTTP ${response.status}`,
				status: response.status,
				bytes: 0,
				contentType: response.headers.get( 'content-type' ) ?? '',
				isHtml: false
			};
		}

		const bytes = new Uint8Array( await response.arrayBuffer() );
		const contentType = response.headers.get( 'content-type' ) ?? '';
		const decodedText = mode === 'text' ? new TextDecoder().decode( bytes ) : '';
		const isHtml = contentType.includes( 'text/html' ) || decodedText.trimStart().startsWith( '<!doctype html' ) || decodedText.trimStart().startsWith( '<html' );
		if ( isHtml ) {
			return {
				ok: false,
				message: 'returned HTML instead of AR.js asset',
				status: response.status,
				bytes: bytes.byteLength,
				contentType,
				isHtml
			};
		}

		if ( bytes.byteLength < 32 ) {
			return {
				ok: false,
				message: `asset bytes too small: ${bytes.byteLength}`,
				status: response.status,
				bytes: bytes.byteLength,
				contentType,
				isHtml
			};
		}

		if (
			mode === 'text'
			&& url.endsWith( '/ar.js' )
			&& decodedText.includes( 'THREEx' ) === false
			&& decodedText.includes( 'ARjs' ) === false
		) {
			return {
				ok: false,
				message: 'ar.js build does not expose THREEx or ARjs runtime',
				status: response.status,
				bytes: bytes.byteLength,
				contentType,
				isHtml
			};
		}

		return {
			ok: true,
			message: 'loaded',
			status: response.status,
			bytes: bytes.byteLength,
			contentType,
			isHtml
		};
	} catch ( error ) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : 'unknown fetch error',
			status: null,
			bytes: 0,
			contentType: '',
			isHtml: false
		};
	}

}

function attachCameraPreview(sourceElement: HTMLVideoElement | HTMLCanvasElement): void {

	if ( sourceElement.parentElement !== cameraPreviewElement ) {
		cameraPreviewElement.replaceChildren( sourceElement );
	}

	sourceElement.style.position = 'fixed';
	sourceElement.style.inset = '0';
	sourceElement.style.width = '100vw';
	sourceElement.style.height = '100vh';
	sourceElement.style.objectFit = 'cover';
	sourceElement.style.zIndex = '0';
	sourceElement.style.background = '#000';

	if ( sourceElement instanceof HTMLVideoElement ) {
		sourceElement.setAttribute( 'playsinline', 'true' );
		sourceElement.muted = true;
		sourceElement.autoplay = true;
		sourceElement.addEventListener( 'loadedmetadata', handleVideoMetadata, { passive: true } );
		sourceElement.addEventListener( 'playing', handleVideoMetadata, { passive: true } );
	}

	syncDebugState();

}

function handleVideoMetadata(): void {

	syncDebugState();
	logMarkerCameraPreview();

}

function initializeSceneRuntime(): void {

	if ( renderer !== null ) {
		return;
	}

	renderer = new THREE.WebGLRenderer( {
		antialias: true,
		alpha: true
	} );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.domElement.className = 'marker-test__canvas';
	renderer.domElement.style.position = 'fixed';
	renderer.domElement.style.inset = '0';
	renderer.domElement.style.width = '100vw';
	renderer.domElement.style.height = '100vh';
	renderer.domElement.style.zIndex = '1';
	renderer.domElement.style.pointerEvents = 'none';
	viewportElement.appendChild( renderer.domElement );

	scene = new THREE.Scene();
	camera = new THREE.Camera();
	scene.add( camera );

	markerRoot = new THREE.Group();
	markerRoot.name = 'marker-root-focus-grid';
	scene.add( markerRoot );

	const markerAxes = new THREE.AxesHelper( 0.3 );
	markerRoot.add( markerAxes );

	const markerCube = new THREE.Mesh(
		new THREE.BoxGeometry( 0.2, 0.2, 0.2 ),
		new THREE.MeshNormalMaterial( { transparent: true, opacity: 0.85 } )
	);
	markerCube.position.y = 0.1;
	markerRoot.add( markerCube );

}

function exposeThreeGlobal(): void {

	( window as MarkerTestWindow ).THREE = THREE;

}

function readArjsRuntimeDiagnostic(scriptLoaded: boolean): ArjsRuntimeDiagnostic {

	installArjsRuntimeShim();

	const markerWindow = window as MarkerTestWindow;
	const runtime = markerWindow.THREEx;
	const arjsNamespace = markerWindow.ARjs;
	const scriptSource = document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR )?.src ?? ARJS_RUNTIME_URL;

	return {
		scriptUrl: scriptSource,
		scriptLoaded,
		hasTHREEx: runtime !== undefined,
		hasARjs: arjsNamespace !== undefined,
		hasArToolkitSource: typeof runtime?.ArToolkitSource === 'function',
		hasArToolkitContext: typeof runtime?.ArToolkitContext === 'function',
		hasArMarkerControls: typeof runtime?.ArMarkerControls === 'function',
		usingArjsNamespaceShim: runtime !== undefined && arjsNamespace !== undefined,
		usingOfficialBuild: scriptSource.includes( '/arjs/build/ar-threex.js' ) || scriptSource.includes( 'AR-js-org/AR.js' ),
		repository: ARJS_REPOSITORY,
		oldRepositoryDetected: detectDeprecatedRepositoryPath()
	};

}

function logArjsRuntime(diagnostic: ArjsRuntimeDiagnostic): void {

	console.info( '[ArjsRuntime]', diagnostic );

}

function createThreexUnavailableError(diagnostic: ArjsRuntimeDiagnostic): Error {

	if ( diagnostic.hasTHREEx === false && diagnostic.hasARjs === false ) {
		return new Error(
			'AR.js runtime unavailable. Please check /arjs/build/ar-threex.js from AR-js-org/AR.js.'
		);
	}

	if ( diagnostic.hasArToolkitSource === false ) {
		return new Error( 'AR.js runtime unavailable: ArToolkitSource/ARjs.Source missing.' );
	}

	if ( diagnostic.hasArToolkitContext === false ) {
		return new Error( 'AR.js runtime unavailable: ArToolkitContext/ARjs.Context missing.' );
	}

	if ( diagnostic.hasArMarkerControls === false ) {
		return new Error( 'AR.js runtime unavailable: ArMarkerControls/ARjs.MarkerControls missing.' );
	}

	return new Error(
		'AR.js runtime unavailable. Please check /arjs/build/ar-threex.js from AR-js-org/AR.js.'
	);

}

function logArjsRuntimeReady(): void {

	console.info( '[ArjsRuntimeReady]', {
		hasTHREE: Boolean( ( window as MarkerTestWindow ).THREE ),
		hasTHREEx: Boolean( ( window as MarkerTestWindow ).THREEx ),
		hasArToolkitSource: typeof ( window as MarkerTestWindow ).THREEx?.ArToolkitSource === 'function',
		hasArToolkitContext: typeof ( window as MarkerTestWindow ).THREEx?.ArToolkitContext === 'function',
		hasArMarkerControls: typeof ( window as MarkerTestWindow ).THREEx?.ArMarkerControls === 'function',
		usingOfficialBuild: true,
		buildUrl: ARJS_RUNTIME_URL,
		sourceReady: arToolkitSourceReady,
		contextInitialized: arToolkitContextReady,
		markerControlsCreated: markerControlsReady
	} );

}

function logMarkerResize(): void {

	console.info( '[MarkerResize]', {
		sourceWidth: arToolkitSource?.domElement instanceof HTMLVideoElement
			? arToolkitSource.domElement.videoWidth
			: arToolkitSource?.domElement instanceof HTMLCanvasElement
				? arToolkitSource.domElement.width
				: 0,
		sourceHeight: arToolkitSource?.domElement instanceof HTMLVideoElement
			? arToolkitSource.domElement.videoHeight
			: arToolkitSource?.domElement instanceof HTMLCanvasElement
				? arToolkitSource.domElement.height
				: 0,
		rendererWidth: renderer?.domElement.width ?? 0,
		rendererHeight: renderer?.domElement.height ?? 0,
		arControllerCanvasWidth: arToolkitContext?.arController?.canvas?.width ?? 0,
		arControllerCanvasHeight: arToolkitContext?.arController?.canvas?.height ?? 0,
		devicePixelRatio: window.devicePixelRatio
	} );

}

function detectDeprecatedRepositoryPath(): boolean {

	const runtimeScriptUrl = document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR )?.src ?? ARJS_RUNTIME_URL;
	return [
		runtimeScriptUrl,
		ARJS_RUNTIME_URL,
		ARJS_CAMERA_PARAMETERS_URL,
		ARJS_MARKER_PATTERN_URL,
		ARJS_MARKER_IMAGE_URL
	].some( ( value ) => value.includes( 'jeromeetienne' ) || value.includes( 'rawgit.com' ) );

}

function isOfficialArjsBuildUrl(url: string): boolean {

	return url.includes( '/arjs/build/ar-threex.js' ) || url.includes( 'AR-js-org/AR.js' );

}

function delay(timeoutMs: number): Promise<void> {

	return new Promise( ( resolve ) => {
		window.setTimeout( resolve, timeoutMs );
	} );

}

function mapMarkerIdToConfigMarkerId(markerId: string): string {

	if ( markerId === DEFAULT_MARKER_ID ) {
		// Debug-only mapping: the marker-test reference marker is temporarily
		// treated as the current config's selected engineering marker so
		// marker-test can reuse project config.
		return currentConfigDefinition.markerConfigId;
	}

	return markerId;

}

function resolveConfigMode(): MarkerTestConfigMode {

	const searchParams = new URLSearchParams( window.location.search );
	const requestedMode = searchParams.get( 'config' );

	if ( requestedMode === 'local-debug' ) {
		return 'local-debug';
	}

	return 'dz1207';

}

function setStatus(message: string): void {

	statusElement.textContent = message;
	summaryStatusElement.textContent = message;

}

function getRequiredElement<TElement extends HTMLElement>(id: string): TElement {

	const element = document.getElementById( id );
	if ( element instanceof HTMLElement === false ) {
		throw new Error( `Missing required marker test element: #${id}` );
	}

	return element as TElement;

}

function formatVector3(vector: THREE.Vector3): string {

	return `${vector.x.toFixed( 4)}, ${vector.y.toFixed( 4)}, ${vector.z.toFixed( 4 )}`;

}

function formatQuaternion(quaternion: THREE.Quaternion): string {

	return `${quaternion.x.toFixed( 4)}, ${quaternion.y.toFixed( 4)}, ${quaternion.z.toFixed( 4)}, ${quaternion.w.toFixed( 4 )}`;

}

function formatMatrix4(matrix: THREE.Matrix4): string {

	return matrix.elements.map( ( value, index ) => {
		const formatted = value.toFixed( 4 );
		const lineBreak = index % 4 === 3 && index < matrix.elements.length - 1 ? '\n' : ', ';
		return `${formatted}${lineBreak}`;
	} ).join( '' ).trim();

}

function formatOptionalNumber(value: number | undefined, digits: number): string {

	return value === undefined ? '-' : value.toFixed( digits );

}

function vectorToPlainObject(vector: THREE.Vector3): { x: number; y: number; z: number } {

	return {
		x: vector.x,
		y: vector.y,
		z: vector.z
	};

}

function getConfiguredMarkerSizeMeters(): number {

	return markerPoseInEnu?.sizeMeters ?? ARJS_DEFAULT_MARKER_SIZE_METERS;

}

function serializeStabilityReport(report: MarkerLocalizationStabilityReport): {
	stable: boolean;
	sampleCount: number;
	averageRmsErrorMeters?: number;
	positionStdMeters?: number;
	headingStdDeg?: number;
	averagedSiteOriginArPosition?: { x: number; y: number; z: number };
	averagedHeadingDeg?: number;
	reason?: string;
	latestSolution?: {
		matrix: number[];
		siteOriginArPosition: { x: number; y: number; z: number };
		headingDeg: number;
		rmsErrorMeters: number;
		correspondenceCount: number;
		source: 'marker';
		timestamp: number;
	};
} {

	return {
		stable: report.stable,
		sampleCount: report.sampleCount,
		averageRmsErrorMeters: report.averageRmsErrorMeters,
		positionStdMeters: report.positionStdMeters,
		headingStdDeg: report.headingStdDeg,
		averagedSiteOriginArPosition: report.averagedSiteOriginArPosition,
		averagedHeadingDeg: report.averagedHeadingDeg,
		reason: report.reason,
		latestSolution: report.latestSolution === undefined
			? undefined
			: {
				matrix: report.latestSolution.matrix.elements.slice(),
				siteOriginArPosition: vectorToPlainObject( report.latestSolution.siteOriginArPosition ),
				headingDeg: report.latestSolution.headingDeg,
				rmsErrorMeters: report.latestSolution.rmsErrorMeters,
				correspondenceCount: report.latestSolution.correspondenceCount,
				source: report.latestSolution.source,
				timestamp: report.latestSolution.arFromEnuSolution.timestamp
			}
	};

}

window.addEventListener( 'beforeunload', () => {
	window.cancelAnimationFrame( animationFrameId );
	window.removeEventListener( 'resize', handleResize );
	renderer?.dispose();
} );
