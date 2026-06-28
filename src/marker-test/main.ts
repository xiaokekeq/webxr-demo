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
const ARJS_RUNTIME_URL = 'https://raw.githack.com/AR-js-org/AR.js/master/three.js/build/ar-threex.js';
const ARJS_CAMERA_PARAMETERS_URL = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.7/data/data/camera_para.dat';
const ARJS_HIRO_PATTERN_URL = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.7/data/data/patt.hiro';
const MARKER_LOCALIZATION_STORAGE_KEY = 'loadModelAR.markerLocalization.lastStableSolution';
const DEFAULT_MARKER_ID = 'hiro';
const LOG_INTERVAL_MS = 250;
const MAIN_AR_PAGE_URL = '/loadModelAR.html';
const THREEX_RUNTIME_POLL_INTERVAL_MS = 100;
const THREEX_RUNTIME_TIMEOUT_MS = 8000;
const LOOP_DEBUG_LOG_INTERVAL_MS = 1000;

const MARKER_TEST_CONFIGS = {
	dz1207: {
		configUrl: '/pipe-viewer/dz1207.config.json',
		hiroMarkerConfigId: 'dike-marker-001'
	},
	'local-debug': {
		configUrl: '/pipe-viewer/company_debug_site.config.json',
		hiroMarkerConfigId: 'local-debug-marker-001'
	}
} as const;

type MarkerTestConfigMode = keyof typeof MARKER_TEST_CONFIGS;

type ArToolkitSourceInstance = {
	readonly domElement: HTMLVideoElement | HTMLCanvasElement;
	readonly ready: boolean;
	init(onReady: () => void): void;
	onResizeElement(): void;
	copyElementSizeTo(element: Element): void;
};

type ArToolkitContextInstance = {
	init(onCompleted: () => void): void;
	getProjectionMatrix(): THREE.Matrix4;
	update(sourceElement: HTMLVideoElement | HTMLCanvasElement): void;
};

type ArMarkerControlsInstance = Record<string, never>;

type ArjsRuntime = {
	ArToolkitSource: new (options: { sourceType: 'webcam' }) => ArToolkitSourceInstance;
	ArToolkitContext: new (options: {
		cameraParametersUrl: string;
		detectionMode: 'mono';
	}) => ArToolkitContextInstance;
	ArMarkerControls: new (
		context: ArToolkitContextInstance,
		object3D: THREE.Object3D,
		options: {
			type: 'pattern';
			patternUrl: string;
		}
	) => ArMarkerControlsInstance;
};

type MarkerTestWindow = Window & typeof globalThis & {
	THREE?: typeof THREE;
	THREEx?: Partial<ArjsRuntime>;
};

type ArjsRuntimeDiagnostic = {
	scriptUrl: string;
	scriptLoaded: boolean;
	hasTHREEx: boolean;
	hasArToolkitSource: boolean;
	hasArToolkitContext: boolean;
	hasArMarkerControls: boolean;
};

type AssetProbeState = 'idle' | 'loading' | 'loaded' | 'failed';

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
const configModeElement = getRequiredElement<HTMLSpanElement>( 'marker-test-config-mode' );
const configUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-config-url' );
const markerConfigIdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-config-id' );
const markerIdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-id' );
const cameraParamUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-camera-param-url' );
const patternUrlElement = getRequiredElement<HTMLSpanElement>( 'marker-test-pattern-url' );
const cameraParamStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-camera-param-status' );
const patternStatusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-pattern-status' );
const hasVideoElementElement = getRequiredElement<HTMLSpanElement>( 'marker-test-has-video-element' );
const videoReadyStateElement = getRequiredElement<HTMLSpanElement>( 'marker-test-video-ready-state' );
const videoSizeElement = getRequiredElement<HTMLSpanElement>( 'marker-test-video-size' );
const arToolkitSourceReadyElement = getRequiredElement<HTMLSpanElement>( 'marker-test-ar-source-ready' );
const arToolkitContextReadyElement = getRequiredElement<HTMLSpanElement>( 'marker-test-ar-context-ready' );
const markerControlsReadyElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-controls-ready' );
const renderLoopRunningElement = getRequiredElement<HTMLSpanElement>( 'marker-test-render-loop-running' );
const lastFrameTimestampElement = getRequiredElement<HTMLSpanElement>( 'marker-test-last-frame-timestamp' );
const markerRootVisibleElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-root-visible' );
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
let lastFrameTimestamp: number | null = null;
let markerRootVisible = false;
let cameraParamStatus: AssetProbeState = 'idle';
let patternStatus: AssetProbeState = 'idle';
const currentConfigMode = resolveConfigMode();
const currentConfigDefinition = MARKER_TEST_CONFIGS[ currentConfigMode ];

markerIdElement.textContent = DEFAULT_MARKER_ID;
configModeElement.textContent = currentConfigMode;
configUrlElement.textContent = currentConfigDefinition.configUrl;
markerConfigIdElement.textContent = mapMarkerIdToConfigMarkerId( DEFAULT_MARKER_ID );
cameraParamUrlElement.textContent = ARJS_CAMERA_PARAMETERS_URL;
patternUrlElement.textContent = ARJS_HIRO_PATTERN_URL;
setStatus( 'Loading AR.js runtime, marker config, and stabilizer...' );
setPoseState( null, false );
setLocalizationState( null, false );
setStabilityState( localizationStabilizer.getReport() );
setSaveStatus( 'Current saved result is for debug only and is not connected to the main WebXR AR flow.' );
syncDebugState();

backToArButton.addEventListener( 'click', handleBackToAr );
resetSamplesButton.addEventListener( 'click', handleResetSamples );
saveStableButton.addEventListener( 'click', handleSaveStableResult );

void boot();

async function boot(): Promise<void> {

	try {
		exposeThreeGlobal();

		const [ runtime, config ] = await Promise.all( [
			loadArjsRuntime(),
			loadDemoModelConfig( currentConfigDefinition.configUrl, () => undefined )
		] );

		await probeMarkerAssets();
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
		sourceType: 'webcam'
	} );
	attachCameraPreview( arToolkitSource.domElement );
	arToolkitContext = new runtime.ArToolkitContext( {
		cameraParametersUrl: ARJS_CAMERA_PARAMETERS_URL,
		detectionMode: 'mono'
	} );
	logArjsMarkerAssets();

	arToolkitSource.init( () => {
		arToolkitSourceReady = true;
		syncDebugState();
		logArjsMarkerAssets();
		logMarkerCameraPreview();
		handleResize();
		setStatus( 'Camera ready. Point the device at a Hiro marker.' );
	} );

	arToolkitContext.init( () => {
		arToolkitContextReady = true;
		syncDebugState();
		logArjsMarkerAssets();
		camera?.projectionMatrix.copy( arToolkitContext?.getProjectionMatrix() ?? new THREE.Matrix4() );
	} );

	markerControls = new runtime.ArMarkerControls(
		arToolkitContext,
		markerRoot,
		{
			type: 'pattern',
			patternUrl: ARJS_HIRO_PATTERN_URL
		}
	);
	markerControlsReady = markerControls !== null;
	syncDebugState();
	logArjsMarkerAssets();

	window.addEventListener( 'resize', handleResize );

}

function startLoop(): void {

	const tick = (): void => {

		animationFrameId = window.requestAnimationFrame( tick );
		renderLoopRunning = true;
		lastFrameTimestamp = Date.now();
		syncDebugState();

		if ( renderer === null || scene === null || camera === null ) {
			return;
		}

		if ( arToolkitSource === null || arToolkitContext === null ) {
			renderer.render( scene, camera );
			return;
		}

		if ( arToolkitSource.ready ) {
			arToolkitContext.update( arToolkitSource.domElement );
		}

		renderMarkerPoseState();
		renderer.render( scene, camera );
		maybeLogArjsLoop();

	};

	tick();

}

function renderMarkerPoseState(): void {

	if ( markerRoot === null ) {
		return;
	}

	markerRoot.updateMatrixWorld( true );
	const visible = markerRoot.visible === true;
	markerRootVisible = visible;
	syncDebugState();

	if ( visible === false ) {
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
		return;
	}

	const markerPoseInAr = createMarkerPoseInArFromArjsObject( {
		markerId: DEFAULT_MARKER_ID,
		object3D: markerRoot
	} );
	const shouldLog = lastVisible === false || markerPoseInAr.timestamp - lastLoggedAt >= LOG_INTERVAL_MS;

	if ( shouldLog ) {
		logMarkerPose( markerPoseInAr );
		lastLoggedAt = markerPoseInAr.timestamp;
	}

	lastVisible = true;
	setPoseState( markerPoseInAr, true );
	resolveMarkerLocalizationDebug( markerPoseInAr, shouldLog );

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

function handleResetSamples(): void {

	localizationStabilizer.reset();
	setStabilityState( localizationStabilizer.getReport() );
	setSaveStatus( 'Sampling reset. Current saved result is still debug-only and not connected to main WebXR.' );
	setStatus( 'Marker localization samples reset.' );

}

function handleBackToAr(): void {

	window.location.assign( MAIN_AR_PAGE_URL );

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

	visibleElement.textContent = visible ? 'visible' : 'lost';

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

	localizationAvailableElement.textContent = available ? 'available' : 'failed';

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
	hasVideoElementElement.textContent = videoElement === null ? 'no' : 'yes';
	videoReadyStateElement.textContent = videoElement === null
		? '-'
		: `${videoElement.readyState}`;
	videoSizeElement.textContent = videoElement === null
		? '-'
		: `${videoElement.videoWidth} / ${videoElement.videoHeight}`;
	arToolkitSourceReadyElement.textContent = arToolkitSourceReady ? 'yes' : 'no';
	arToolkitContextReadyElement.textContent = arToolkitContextReady ? 'yes' : 'no';
	markerControlsReadyElement.textContent = markerControlsReady ? 'yes' : 'no';
	cameraParamStatusElement.textContent = cameraParamStatus;
	patternStatusElement.textContent = patternStatus;
	renderLoopRunningElement.textContent = renderLoopRunning ? 'yes' : 'no';
	lastFrameTimestampElement.textContent = lastFrameTimestamp === null
		? '-'
		: new Date( lastFrameTimestamp ).toLocaleTimeString( 'zh-CN', { hour12: false } );
	markerRootVisibleElement.textContent = markerRootVisible ? 'yes' : 'no';

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
	const sourceElement = arToolkitSource?.domElement ?? null;
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
		cameraParamUrl: ARJS_CAMERA_PARAMETERS_URL,
		patternUrl: ARJS_HIRO_PATTERN_URL,
		arToolkitSourceReady,
		arToolkitContextReady,
		markerControlsReady,
		cameraParamStatus,
		patternStatus
	} );

}

function maybeLogArjsLoop(): void {

	const now = Date.now();
	if ( now - lastLoopLogAt < LOOP_DEBUG_LOG_INTERVAL_MS ) {
		return;
	}

	lastLoopLogAt = now;
	console.info( '[ArjsMarkerLoop]', {
		renderLoopRunning,
		lastFrameTimestamp,
		markerRootVisible
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
	attachCameraPreview( arToolkitSource.domElement );
	syncDebugState();
	logMarkerCameraPreview();

	const canvas = renderer.domElement;
	canvas.style.position = 'fixed';
	canvas.style.inset = '0';
	canvas.style.width = '100vw';
	canvas.style.height = '100vh';
	canvas.style.zIndex = '1';
	canvas.style.pointerEvents = 'none';

}

function getCurrentPreviewVideoElement(): HTMLVideoElement | null {

	const sourceElement = arToolkitSource?.domElement;
	if ( sourceElement instanceof HTMLVideoElement ) {
		return sourceElement;
	}

	const previewVideo = cameraPreviewElement.querySelector( 'video' );
	return previewVideo instanceof HTMLVideoElement ? previewVideo : null;

}

async function loadArjsRuntime(): Promise<ArjsRuntime> {

	exposeThreeGlobal();

	const existingRuntime = readArjsRuntime();
	if ( existingRuntime !== null ) {
		logArjsRuntime( readArjsRuntimeDiagnostic( true ) );
		return existingRuntime;
	}

	const existingScript = document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR );
	if ( existingScript !== null ) {
		if ( existingScript.dataset.loaded !== 'true' ) {
			await waitForScriptLoad( existingScript );
		}

		const existingRuntimeAfterLoad = await waitForThreexRuntime( 600 );
		if ( existingRuntimeAfterLoad !== null ) {
			return existingRuntimeAfterLoad;
		}

		existingScript.remove();
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

	cameraParamStatus = 'loading';
	patternStatus = 'loading';
	syncDebugState();
	logArjsMarkerAssets();

	const [ cameraParamResult, patternResult ] = await Promise.all( [
		probeAssetUrl( ARJS_CAMERA_PARAMETERS_URL ),
		probeAssetUrl( ARJS_HIRO_PATTERN_URL )
	] );

	cameraParamStatus = cameraParamResult.ok ? 'loaded' : 'failed';
	patternStatus = patternResult.ok ? 'loaded' : 'failed';
	syncDebugState();
	logArjsMarkerAssets();

	if ( cameraParamResult.ok === false ) {
		throw new Error( `camera_para.dat load failed: ${cameraParamResult.message}` );
	}

	if ( patternResult.ok === false ) {
		throw new Error( `patt.hiro load failed: ${patternResult.message}` );
	}

}

async function probeAssetUrl(url: string): Promise<{
	ok: boolean;
	message: string;
}> {

	try {
		const response = await fetch( url, {
			method: 'GET',
			cache: 'no-cache'
		} );
		if ( response.ok === false ) {
			return {
				ok: false,
				message: `HTTP ${response.status}`
			};
		}

		return {
			ok: true,
			message: 'loaded'
		};
	} catch ( error ) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : 'unknown fetch error'
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
	markerRoot.name = 'marker-root-hiro';
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

	const runtime = ( window as MarkerTestWindow ).THREEx;

	return {
		scriptUrl: ARJS_RUNTIME_URL,
		scriptLoaded,
		hasTHREEx: runtime !== undefined,
		hasArToolkitSource: typeof runtime?.ArToolkitSource === 'function',
		hasArToolkitContext: typeof runtime?.ArToolkitContext === 'function',
		hasArMarkerControls: typeof runtime?.ArMarkerControls === 'function'
	};

}

function logArjsRuntime(diagnostic: ArjsRuntimeDiagnostic): void {

	console.info( '[ArjsRuntime]', diagnostic );

}

function createThreexUnavailableError(diagnostic: ArjsRuntimeDiagnostic): Error {

	if ( diagnostic.hasTHREEx === false ) {
		return new Error(
			'AR.js THREEx runtime unavailable. Please check ar-threex.js CDN or local runtime file.'
		);
	}

	if ( diagnostic.hasArToolkitSource === false ) {
		return new Error( 'AR.js THREEx runtime unavailable: ArToolkitSource missing.' );
	}

	if ( diagnostic.hasArToolkitContext === false ) {
		return new Error( 'AR.js THREEx runtime unavailable: ArToolkitContext missing.' );
	}

	if ( diagnostic.hasArMarkerControls === false ) {
		return new Error( 'AR.js THREEx runtime unavailable: ArMarkerControls missing.' );
	}

	return new Error(
		'AR.js THREEx runtime unavailable. Please check ar-threex.js CDN or local runtime file.'
	);

}

function delay(timeoutMs: number): Promise<void> {

	return new Promise( ( resolve ) => {
		window.setTimeout( resolve, timeoutMs );
	} );

}

function mapMarkerIdToConfigMarkerId(markerId: string): string {

	if ( markerId === DEFAULT_MARKER_ID ) {
		// Debug-only mapping: Hiro is temporarily treated as the current config's
		// selected engineering marker so marker-test can reuse project config.
		return currentConfigDefinition.hiroMarkerConfigId;
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
