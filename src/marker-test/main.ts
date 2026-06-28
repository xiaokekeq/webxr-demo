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
const ARJS_RUNTIME_URL = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.7/three.js/build/ar-threex.js';
const ARJS_CAMERA_PARAMETERS_URL = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.7/three.js/data/data/camera_para.dat';
const ARJS_HIRO_PATTERN_URL = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.7/three.js/data/data/patt.hiro';
const MARKER_CONFIG_URL = '/pipe-viewer/dz1207.config.json';
const MARKER_LOCALIZATION_STORAGE_KEY = 'loadModelAR.markerLocalization.lastStableSolution';
const DEFAULT_MARKER_ID = 'hiro';
const DEBUG_MARKER_CONFIG_ID = 'dike-marker-001';
const LOG_INTERVAL_MS = 250;

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
const statusElement = getRequiredElement<HTMLSpanElement>( 'marker-test-status' );
const markerIdElement = getRequiredElement<HTMLSpanElement>( 'marker-test-marker-id' );
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
const resetSamplesButton = getRequiredElement<HTMLButtonElement>( 'marker-test-reset-samples' );
const saveStableButton = getRequiredElement<HTMLButtonElement>( 'marker-test-save-stable' );

const renderer = new THREE.WebGLRenderer( {
	antialias: true,
	alpha: true
} );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.domElement.className = 'marker-test__canvas';
viewportElement.appendChild( renderer.domElement );

const scene = new THREE.Scene();
const camera = new THREE.Camera();
scene.add( camera );

const markerRoot = new THREE.Group();
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

const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const localizationStabilizer = new MarkerLocalizationStabilizer();

let arToolkitSource: ArToolkitSourceInstance | null = null;
let arToolkitContext: ArToolkitContextInstance | null = null;
let markerControls: ArMarkerControlsInstance | null = null;
let lastVisible = false;
let lastLoggedAt = 0;
let animationFrameId = 0;
let demoModelConfig: DemoModelConfig | null = null;
let markerPoseInEnu: MarkerPoseInEnu | null = null;

markerIdElement.textContent = DEFAULT_MARKER_ID;
setStatus( 'Loading AR.js runtime, marker config, and stabilizer...' );
setPoseState( null, false );
setLocalizationState( null, false );
setStabilityState( localizationStabilizer.getReport() );
setSaveStatus( 'Current saved result is for debug only and is not connected to the main WebXR AR flow.' );

resetSamplesButton.addEventListener( 'click', handleResetSamples );
saveStableButton.addEventListener( 'click', handleSaveStableResult );

void boot();

async function boot(): Promise<void> {

	try {
		const [ runtime, config ] = await Promise.all( [
			loadArjsRuntime(),
			loadDemoModelConfig( MARKER_CONFIG_URL, () => undefined )
		] );
		demoModelConfig = config;
		markerPoseInEnu = resolveMarkerPoseInEnu( config, mapMarkerIdToConfigMarkerId( DEFAULT_MARKER_ID ) );
		setStatus( 'Opening camera...' );
		setupArjsScene( runtime );
		startLoop();
	} catch ( error ) {
		console.error( 'Marker test boot failed:', error );
		setStatus( error instanceof Error ? error.message : 'Marker test boot failed.' );
	}

}

function setupArjsScene(runtime: ArjsRuntime): void {

	arToolkitSource = new runtime.ArToolkitSource( {
		sourceType: 'webcam'
	} );
	arToolkitContext = new runtime.ArToolkitContext( {
		cameraParametersUrl: ARJS_CAMERA_PARAMETERS_URL,
		detectionMode: 'mono'
	} );

	arToolkitSource.init( () => {
		handleResize();
		setStatus( 'Camera ready. Point the device at a Hiro marker.' );
	} );

	arToolkitContext.init( () => {
		camera.projectionMatrix.copy( arToolkitContext?.getProjectionMatrix() ?? new THREE.Matrix4() );
	} );

	markerControls = new runtime.ArMarkerControls(
		arToolkitContext,
		markerRoot,
		{
			type: 'pattern',
			patternUrl: ARJS_HIRO_PATTERN_URL
		}
	);

	window.addEventListener( 'resize', handleResize );

}

function startLoop(): void {

	const tick = (): void => {

		animationFrameId = window.requestAnimationFrame( tick );

		if ( arToolkitSource === null || arToolkitContext === null ) {
			renderer.render( scene, camera );
			return;
		}

		if ( arToolkitSource.ready ) {
			arToolkitContext.update( arToolkitSource.domElement );
		}

		renderMarkerPoseState();
		renderer.render( scene, camera );

	};

	tick();

}

function renderMarkerPoseState(): void {

	markerRoot.updateMatrixWorld( true );
	const visible = markerRoot.visible === true;

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
		: `${report.averagedSiteOriginArPosition.x.toFixed( 4)}, ${report.averagedSiteOriginArPosition.y.toFixed( 4)}, ${report.averagedSiteOriginArPosition.z.toFixed( 4 )}`;
	stabilityAveragedHeadingElement.textContent = formatOptionalNumber( report.averagedHeadingDeg, 4 );
	stabilityReasonElement.textContent = report.reason ?? '-';
	saveStableButton.disabled = report.stable === false;

}

function setSaveStatus(message: string): void {

	saveStatusElement.textContent = message;

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

function handleResize(): void {

	renderer.setSize( window.innerWidth, window.innerHeight );

	if ( arToolkitSource === null ) {
		return;
	}

	arToolkitSource.onResizeElement();
	arToolkitSource.copyElementSizeTo( renderer.domElement );

	const canvas = renderer.domElement;
	if ( canvas.style.position.length === 0 ) {
		canvas.style.position = 'absolute';
	}

}

async function loadArjsRuntime(): Promise<ArjsRuntime> {

	const existingRuntime = readArjsRuntime();
	if ( existingRuntime !== null ) {
		return existingRuntime;
	}

	const existingScript = document.querySelector<HTMLScriptElement>( ARJS_SCRIPT_SELECTOR );
	if ( existingScript !== null ) {
		await waitForScriptLoad( existingScript );
		const loadedRuntime = readArjsRuntime();
		if ( loadedRuntime !== null ) {
			return loadedRuntime;
		}
	}

	const script = document.createElement( 'script' );
	script.async = true;
	script.dataset.arjsRuntime = 'true';
	script.src = ARJS_RUNTIME_URL;
	document.head.appendChild( script );
	await waitForScriptLoad( script );

	const runtime = readArjsRuntime();
	if ( runtime === null ) {
		throw new Error( 'AR.js runtime loaded, but THREEx is still unavailable.' );
	}

	return runtime;

}

function readArjsRuntime(): ArjsRuntime | null {

	const candidate = ( window as Window & { THREEx?: ArjsRuntime } ).THREEx;
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

	return candidate;

}

function waitForScriptLoad(script: HTMLScriptElement): Promise<void> {

	if ( script.dataset.loaded === 'true' ) {
		return Promise.resolve();
	}

	return new Promise<void>( ( resolve, reject ) => {
		const handleLoad = () => {
			script.dataset.loaded = 'true';
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject( new Error( 'Failed to load AR.js runtime script.' ) );
		};
		const cleanup = () => {
			script.removeEventListener( 'load', handleLoad );
			script.removeEventListener( 'error', handleError );
		};

		script.addEventListener( 'load', handleLoad );
		script.addEventListener( 'error', handleError );
	} );

}

function mapMarkerIdToConfigMarkerId(markerId: string): string {

	if ( markerId === DEFAULT_MARKER_ID ) {
		// Debug-only mapping: Hiro is temporarily treated as dike-marker-001
		// so marker-test can reuse dz1207 marker engineering config.
		return DEBUG_MARKER_CONFIG_ID;
	}

	return markerId;

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
	renderer.dispose();
} );
