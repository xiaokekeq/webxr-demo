import * as THREE from 'three';
import { MODEL_CONFIG_URL, MODEL_URL } from '../load-model/config.js';
import { createHighlightedMaterial, disposeDynamicMaterials } from '../load-model/materials.js';
import type { PipeRecord } from '../load-model/types.js';
import { createDesktopPanel } from './desktop-panel.js';
import { loadDemoModelConfig, type DemoModelConfig } from './demo-model-config.js';
import {
	composeModelQuaternionInAr,
	createCoarseTargetFromEngineeringSolution,
	solveEngineeringRegistration,
	type EngineeringRegistrationSolution
} from './engineering-registration.js';
import { createStatusUpdater, getARDomElements } from './dom.js';
import { createCoarseRegistrationController } from './coarse-registration.js';
import {
	createManualRegistrationController,
	type ManualPlacementBase,
	type ManualRegistrationState
} from './manual-registration.js';
import { loadPipeRecords, PROJECT_NAME, STATIC_LAYER_NAMES, TIMELINE_STAGES } from './model-data.js';
import { clearPlacedModel, loadModelTemplate, placeModelAt } from './model.js';
import { createMobilePanel } from './mobile-panel.js';
import {
	createDefaultManualReadoutState,
	createDefaultPlacementSummaryState,
	createDefaultPropertyPanelState,
	createDefaultRegistrationMetricsState,
	createRegistrationStore,
	type WorkspaceMode
} from './registration-store.js';
import { createARScene, resizeARScene } from './scene.js';
import { createXRHitTestController } from './xr.js';

const DESKTOP_MEDIA_QUERY = window.matchMedia( '(any-pointer: fine)' );

const MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS = 8;
const MAX_RELIABLE_GPS_ACCURACY_METERS = 15;
const PREVIEW_PLACEMENT_DISTANCE_METERS = 2.5;
const MAX_LOG_ITEMS = 24;
const DEFAULT_DESKTOP_PREVIEW_BADGE = '3D 预览区域';

const dom = getARDomElements();
const sceneBundle = createARScene( dom.canvasContainer );
const desktopPanel = createDesktopPanel( dom );
const mobilePanel = createMobilePanel( dom );
const updateStatusText = createStatusUpdater( dom.statusButton );

const store = createRegistrationStore( {
	projectName: PROJECT_NAME,
	modelUrl: MODEL_URL,
	workspaceMode: 'browse',
	timelineStages: TIMELINE_STAGES,
	currentTimelineStageIndex: 2,
	layerNames: STATIC_LAYER_NAMES,
	pipeList: [],
	propertyPanel: createDefaultPropertyPanelState(),
	manualReadout: createDefaultManualReadoutState(),
	registrationMetrics: createDefaultRegistrationMetricsState(),
	placementSummary: createDefaultPlacementSummaryState(),
	registrationStatusDetail: '状态：等待识别平面',
	runtimeStatus: '等待初始化',
	desktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE,
	logMessages: []
} );

const coarseGroundPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const previewForward = new THREE.Vector3();
const previewPosition = new THREE.Vector3();
const previewTarget = new THREE.Vector3();
const previewCameraDirection = new THREE.Vector3( 0.85, 0.48, 1 );
const pointer = new THREE.Vector2();
const pointerDownPosition = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const modelOrientation = new THREE.Quaternion();
const manualPosition = new THREE.Vector3();
const manualOrientation = new THREE.Quaternion();
const desktopAxesHelper = new THREE.AxesHelper( 0.8 );
const previewBounds = new THREE.Box3();
const previewSize = new THREE.Vector3();
const previewCenter = new THREE.Vector3();
const previewSphere = new THREE.Sphere();

let modelTemplate: THREE.Group | null = null;
let demoModelConfig: DemoModelConfig | null = null;
let registrationSolution: EngineeringRegistrationSolution | null = null;
let placedModel: THREE.Group | null = null;
let coarsePlacementPending = false;
let coarseRegistration = createCoarseRegistrationController( { setStatus } );
let pipesByName = new Map<string, PipeRecord>();
let selectedBusinessObject: THREE.Object3D | null = null;
let selectedMeshes: THREE.Mesh[] = [];
let lastPlacementBase: ManualPlacementBase | null = null;
let desktopAxesAttached = false;

const manualRegistration = createManualRegistrationController( {
	setStatus,
	onStateChange: updateManualRegistrationReadout
} );

store.subscribe( () => {
	renderPanels();
} );

desktopPanel.bind( {
	onSaveRegistration: saveManualRegistration,
	onExportJson: exportRegistrationSnapshot
} );

mobilePanel.bind( {
	onCloseProperty: () => {
		clearSelection();
		setStatus( '已收起属性卡片。' );
	},
	onSetWorkspaceMode: setWorkspaceMode,
	onResetPlacement: handleResetPlacement,
	onShowLayers: () => {
		setStatus( '图层控制面板尚未接入，当前先展示图层列表结构。' );
	},
	onMeasure: () => {
		setStatus( '测距工具尚未接入，当前先保留交互入口。' );
	},
	onEnableCoarse: handleEnableCoarseRegistration,
	onRefreshGeo: handleRefreshGeoLocation,
	onAdjustTranslation: ( axis, direction ) => {
		manualRegistration.adjustTranslation( axis, direction );
		reapplyManualRegistration();
	},
	onAdjustYaw: ( direction ) => {
		manualRegistration.adjustYaw( direction );
		reapplyManualRegistration();
	},
	onAdjustScale: ( direction ) => {
		manualRegistration.adjustScale( direction );
		reapplyManualRegistration();
	},
	onSaveManualRegistration: saveManualRegistration,
	onResetManualRegistration: handleResetManualRegistration,
	onSetTimelineStage: setTimelineStage,
	onTimelinePrev: () => {
		setTimelineStage( store.getState().currentTimelineStageIndex - 1 );
	},
	onTimelineNext: () => {
		setTimelineStage( store.getState().currentTimelineStageIndex + 1 );
	},
	onTimelinePlay: () => {
		setStatus( '时间序列播放功能尚未开发，当前仅支持阶段切换。' );
	},
	onInspectionPhoto: () => {
		setStatus( '拍照入口已预留，后续将接入相机或图片上传。' );
	},
	onInspectionSave: ( draft ) => {
		setStatus(
			`已记录核查草稿：${draft.type} / ${draft.severity}${draft.note ? ` / ${draft.note}` : ''}。正式保存流程尚未开发。`
		);
	}
} );

renderPanels();

const xrHitTest = createXRHitTestController( {
	renderer: sceneBundle.renderer,
	reticle: sceneBundle.reticle,
	xrButtonWrap: dom.xrButtonWrap,
	setStatus,
	onSessionStart: () => {
		resetPlacement();
		updateDesktopInteractionState();
		updateRegistrationStatusDetail( '状态：等待粗配准' );
		if ( coarseRegistration.canEstimate() ) {
			coarsePlacementPending = true;
		}
	},
	onSessionEnd: () => {
		resetPlacement();
		updateDesktopInteractionState();
		updateRegistrationStatusDetail( '状态：等待识别平面' );
		if ( isDesktopLayout() ) {
			ensureDesktopPreviewPlacement();
			fitDesktopPreviewCamera();
		}
	},
	canReportStatus: () => placedModel === null && coarsePlacementPending === false
} );

initialize();

async function initialize(): Promise<void> {

	setStatus( '系统初始化中...' );
	syncCanvasHost();
	sceneBundle.renderer.setAnimationLoop( render );
	xrHitTest.setup();

	sceneBundle.renderer.domElement.addEventListener( 'pointerdown', onPointerDown );
	sceneBundle.renderer.domElement.addEventListener( 'pointerup', onPointerUp );

	window.addEventListener( 'resize', onWindowResize );
	DESKTOP_MEDIA_QUERY.addEventListener( 'change', () => {
		syncCanvasHost();
		updateDesktopSceneDecorations();
		if ( isDesktopLayout() ) {
			ensureDesktopPreviewPlacement();
			fitDesktopPreviewCamera();
		}
	} );

	try {
		pipesByName = await loadPipeRecords();
		store.patch( { pipeList: Array.from( pipesByName.values() ) } );

		demoModelConfig = await loadDemoModelConfig( MODEL_CONFIG_URL, setStatus );
		manualRegistration.load( demoModelConfig.modelId );
		registrationSolution = solveEngineeringRegistration( demoModelConfig );
		updateRegistrationMetrics();
		appendLog( `工程注册已求解，控制点数量 ${registrationSolution.controlPoints.length}。` );
		setStatus( `工程注册完成，RMS 误差 ${registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m。` );

		coarseRegistration = createCoarseRegistrationController( {
			setStatus,
			target: createCoarseTargetFromEngineeringSolution( registrationSolution )
		} );

		modelTemplate = await loadModelTemplate( MODEL_URL, setStatus, 1 );
		appendLog( '模型加载成功。' );
		updateRegistrationStatusDetail( '状态：模型已加载 / 等待识别平面' );

		updateDesktopSceneDecorations();
		if ( isDesktopLayout() ) {
			ensureDesktopPreviewPlacement();
			fitDesktopPreviewCamera();
			if ( 'xr' in navigator === false ) {
				appendLog( 'AR 不支持：当前设备处于桌面调试模式。' );
			}
		}

		void coarseRegistration.prime()
			.then( () => {
				appendLog( '粗配准传感器已预热。' );
				if ( sceneBundle.renderer.xr.isPresenting ) {
					requestAutoPlacement();
				}
			} )
			.catch( () => {
				appendLog( '粗配准预热未自动完成，可手动启用。' );
			} );
	} catch ( error ) {
		console.error( 'AR bootstrap failed:', error );
		setStatus( error instanceof Error ? error.message : '初始化失败。' );
	}

}

function setStatus(message: string): void {

	updateStatusText( message );
	store.patch( { runtimeStatus: message } );
	appendLog( message );

}

function renderPanels(): void {

	const state = store.getState();
	desktopPanel.render( state );
	mobilePanel.render( state );

}

function appendLog(message: string): void {

	const currentLogs = store.getState().logMessages;
	if ( currentLogs[ 0 ]?.endsWith( message ) ) {
		return;
	}

	store.patch( {
		logMessages: [ `[${getTimeLabel()}] ${message}`, ...currentLogs ].slice( 0, MAX_LOG_ITEMS )
	} );

}

function setWorkspaceMode(mode: WorkspaceMode): void {

	if ( store.getState().workspaceMode === mode ) {
		return;
	}

	store.patch( { workspaceMode: mode } );

	switch ( mode ) {
		case 'browse':
			setStatus( '已切换到浏览模式。' );
			break;
		case 'registration':
			setStatus( '已切换到配准模式。' );
			break;
		case 'timeline':
			setStatus( '已切换到时间模式。' );
			break;
		case 'inspection':
			setStatus( '已切换到核查模式。' );
			break;
	}

}

function setTimelineStage(index: number): void {

	const state = store.getState();
	const clampedIndex = THREE.MathUtils.clamp( index, 0, state.timelineStages.length - 1 );
	store.patch( { currentTimelineStageIndex: clampedIndex } );
	setStatus( `当前阶段已切换为：${state.timelineStages[ clampedIndex ]}。` );

}

function handleResetPlacement(): void {

	resetPlacement();
	if ( sceneBundle.renderer.xr.isPresenting ) {
		requestAutoPlacement();
		setStatus( '模型已复位，等待重新自动放置。' );
		return;
	}

	ensureDesktopPreviewPlacement();
	fitDesktopPreviewCamera();
	setStatus( '模型放置已复位。' );

}

async function handleEnableCoarseRegistration(): Promise<void> {

	try {
		await coarseRegistration.enable();
		requestAutoPlacement();
		updateRegistrationStatusDetail( '状态：粗配准已启用' );
	} catch ( error ) {
		console.error( 'Coarse registration enable failed:', error );
		setStatus( error instanceof Error ? error.message : '启用粗配准失败。' );
	}

}

async function handleRefreshGeoLocation(): Promise<void> {

	try {
		await coarseRegistration.refreshGeolocation();
		setStatus( coarseRegistration.getReadyMessage() );
		requestAutoPlacement();
	} catch ( error ) {
		console.error( 'Geolocation refresh failed:', error );
		setStatus( error instanceof Error ? error.message : '刷新定位失败。' );
	}

}

function handleResetManualRegistration(): void {

	if ( demoModelConfig !== null ) {
		manualRegistration.clearSaved( demoModelConfig.modelId );
	}

	manualRegistration.reset();
	reapplyManualRegistration();
	setStatus( '手动配准已重置。' );

}

function saveManualRegistration(): void {

	if ( demoModelConfig === null ) {
		setStatus( '模型配置尚未就绪。' );
		return;
	}

	manualRegistration.save( demoModelConfig.modelId );
	setStatus( '配准结果已保存。' );

}

function exportRegistrationSnapshot(): void {

	if ( demoModelConfig === null || registrationSolution === null ) {
		setStatus( '当前没有可导出的配准结果。' );
		return;
	}

	const snapshot = {
		modelId: demoModelConfig.modelId,
		stage: store.getState().timelineStages[ store.getState().currentTimelineStageIndex ],
		siteOrigin: registrationSolution.siteOrigin,
		rootWorldGeodetic: registrationSolution.rootWorldGeodetic,
		modelToSite: {
			translation: vectorToPlainObject( registrationSolution.modelToSite.translation ),
			rotation: quaternionToPlainObject( registrationSolution.modelToSite.rotation ),
			scale: registrationSolution.modelToSite.scale,
			rmsErrorMeters: registrationSolution.modelToSite.rmsErrorMeters
		},
		manualRegistration: store.getState().manualReadout,
		currentPlacement: placedModel === null ? null : {
			position: vectorToPlainObject( placedModel.position ),
			quaternion: quaternionToPlainObject( placedModel.quaternion ),
			scale: vectorToPlainObject( placedModel.scale )
		}
	};

	const blob = new Blob( [ JSON.stringify( snapshot, null, 2 ) ], { type: 'application/json' } );
	const url = URL.createObjectURL( blob );
	const link = document.createElement( 'a' );

	link.href = url;
	link.download = `${demoModelConfig.modelId}-registration.json`;
	link.click();
	URL.revokeObjectURL( url );

	setStatus( '配准结果 JSON 已导出。' );

}

function onPointerDown(event: PointerEvent): void {

	pointerDownPosition.set( event.clientX, event.clientY );

}

function onPointerUp(event: PointerEvent): void {

	if ( placedModel === null ) {
		return;
	}

	const dragDistance = pointerDownPosition.distanceTo( new THREE.Vector2( event.clientX, event.clientY ) );
	if ( dragDistance > 10 ) {
		return;
	}

	const rect = sceneBundle.renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

	raycaster.setFromCamera( pointer, sceneBundle.camera );
	const intersects = raycaster.intersectObjects( placedModel.children, true );

	if ( intersects.length === 0 ) {
		clearSelection();
		setStatus( '未选中模型部件。' );
		return;
	}

	const clickedMesh = intersects[ 0 ].object;
	const businessObject = resolveBusinessObject( clickedMesh );
	const businessName = businessObject.name || clickedMesh.name || 'UnnamedObject';
	const properties = pipesByName.get( businessName ) || null;

	applyHighlight( businessObject );
	updatePropertyPanel( businessName, properties );

	if ( store.getState().workspaceMode === 'browse' ) {
		setStatus(
			properties
				? `已选中 ${businessName}。`
				: `已选中 ${businessName}，但未找到匹配的业务属性记录。`
		);
		return;
	}

	setStatus( `已选中 ${businessName}。切换到浏览模式可查看属性详情。` );

}

function resolveBusinessObject(mesh: THREE.Object3D): THREE.Object3D {

	if ( placedModel === null ) {
		return mesh;
	}

	let current: THREE.Object3D | null = mesh;
	let fallback = mesh;

	while ( current && current !== placedModel ) {
		if ( current.name ) {
			fallback = current;
		}

		if ( current.name && pipesByName.has( current.name ) ) {
			return current;
		}

		current = current.parent;
	}

	return fallback;

}

function applyHighlight(businessObject: THREE.Object3D): void {

	clearSelection();
	selectedBusinessObject = businessObject;

	businessObject.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh ) {
			selectedMeshes.push( child );
			child.userData.__originalMaterial = child.material;

			const materials = Array.isArray( child.material ) ? child.material : [ child.material ];
			const highlightedMaterials = materials.map( createHighlightedMaterial );
			child.material = Array.isArray( child.material ) ? highlightedMaterials : highlightedMaterials[ 0 ];
		}
	} );

}

function clearSelection(): void {

	for ( const mesh of selectedMeshes ) {
		if ( mesh.userData.__originalMaterial ) {
			disposeDynamicMaterials( mesh.material, mesh.userData.__originalMaterial );
			mesh.material = mesh.userData.__originalMaterial;
			delete mesh.userData.__originalMaterial;
		}
	}

	selectedMeshes = [];
	selectedBusinessObject = null;
	store.patch( { propertyPanel: createDefaultPropertyPanelState() } );

}

function updatePropertyPanel(businessName: string, properties: PipeRecord | null): void {

	store.patch( {
		propertyPanel: {
			name: businessName,
			statusBadge: properties?.status || '待核查',
			type: properties?.type || '-',
			diameter: properties?.diameter || '-',
			material: properties?.material || '-',
			depth: properties?.depth || '-',
			status: properties?.status || '-',
			remark: properties?.remark || '未找到匹配的业务属性记录。'
		}
	} );

}

function resetPlacement(): void {

	placedModel = clearPlacedModel( sceneBundle.modelAnchor, placedModel );
	coarsePlacementPending = false;
	lastPlacementBase = null;
	clearSelection();
	store.patch( { desktopPreviewBadge: DEFAULT_DESKTOP_PREVIEW_BADGE } );
	updatePlacementSummary();

}

function requestAutoPlacement(): void {

	if ( modelTemplate === null || sceneBundle.renderer.xr.isPresenting === false ) {
		return;
	}

	coarsePlacementPending = true;
	updateRegistrationStatusDetail( '状态：等待命中测试平面' );
	attemptCoarsePlacement();

}

function render(_: number, frame?: XRFrame): void {

	if ( sceneBundle.renderer.xr.isPresenting && frame ) {
		xrHitTest.update( frame );
		attemptCoarsePlacement();
	}

	if ( isDesktopLayout() && sceneBundle.renderer.xr.isPresenting === false ) {
		sceneBundle.controls.update();
	}

	sceneBundle.renderer.render( sceneBundle.scene, sceneBundle.camera );

}

function attemptCoarsePlacement(): void {

	if (
		coarsePlacementPending === false
		|| modelTemplate === null
		|| registrationSolution === null
		|| coarseRegistration.canEstimate() === false
		|| xrHitTest.hasGroundHit() === false
	) {
		return;
	}

	const groundPosition = xrHitTest.getHitPosition( coarseGroundPosition );
	if ( groundPosition === null ) {
		updateRegistrationStatusDetail( '状态：等待识别平面' );
		return;
	}

	sceneBundle.camera.getWorldPosition( cameraWorldPosition );
	const estimate = coarseRegistration.estimatePlacement( cameraWorldPosition, groundPosition.y );
	if ( estimate === null ) {
		updateRegistrationStatusDetail( '状态：等待粗配准数据' );
		setStatus( coarseRegistration.getMissingRequirementMessage() );
		return;
	}

	const shouldUsePreviewPlacement = (
		estimate.distanceMeters > MAX_VISIBLE_AUTO_PLACEMENT_DISTANCE_METERS
		|| (
			estimate.accuracyMeters !== null
			&& estimate.accuracyMeters > MAX_RELIABLE_GPS_ACCURACY_METERS
		)
	);

	const targetPosition = shouldUsePreviewPlacement
		? getPreviewPlacementPosition( sceneBundle.camera, cameraWorldPosition, groundPosition.y )
		: estimate.position;

	const orientation = composeModelQuaternionInAr(
		estimate.orientation,
		registrationSolution,
		modelOrientation
	);
	const placementScale = getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale );

	lastPlacementBase = {
		position: targetPosition.clone(),
		orientation: orientation.clone(),
		scale: placementScale
	};

	const adjustedPlacement = manualRegistration.applyToPlacement(
		lastPlacementBase,
		manualPosition,
		manualOrientation
	);

	placedModel = placeModelAt(
		modelTemplate,
		placedModel,
		sceneBundle.modelAnchor,
		adjustedPlacement.position,
		adjustedPlacement.orientation,
		adjustedPlacement.scale
	);

	coarsePlacementPending = false;
	updateRegistrationStatusDetail( '状态：模型已加载 / 平面已识别' );
	updatePlacementSummary();

	const accuracyText = estimate.accuracyMeters === null
		? '暂无 GPS 精度信息'
		: `GPS 精度约 ${Math.round( estimate.accuracyMeters )}m`;

	if ( shouldUsePreviewPlacement ) {
		setStatus(
			`目标距离约 ${Math.round( estimate.distanceMeters )}m，${accuracyText}，已切换到近距离预览模式。`
		);
		return;
	}

	setStatus(
		`粗配准完成：${registrationSolution.modelId}，距离约 ${Math.round( estimate.distanceMeters )}m，RMS ${registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )}m，${accuracyText}。`
	);

}

function getPreviewPlacementPosition(
	camera: THREE.Camera,
	cameraPosition: THREE.Vector3,
	groundY: number
): THREE.Vector3 {

	camera.getWorldDirection( previewForward );
	previewForward.y = 0;

	if ( previewForward.lengthSq() < 1e-6 ) {
		previewForward.set( 0, 0, -1 );
	} else {
		previewForward.normalize();
	}

	previewPosition.copy( cameraPosition );
	previewPosition.addScaledVector( previewForward, PREVIEW_PLACEMENT_DISTANCE_METERS );
	previewPosition.y = groundY;

	return previewPosition;

}

function getPlacementResidualScale(modelTemplateGroup: THREE.Group, registrationScale: number): number {

	const bakedScaleFactor = typeof modelTemplateGroup.userData.__bakedScaleFactor === 'number'
		? modelTemplateGroup.userData.__bakedScaleFactor
		: 1;

	if ( Math.abs( bakedScaleFactor ) < 1e-9 ) {
		return registrationScale;
	}

	return registrationScale / bakedScaleFactor;

}

function reapplyManualRegistration(): void {

	if ( placedModel === null || modelTemplate === null || lastPlacementBase === null ) {
		if ( isDesktopLayout() ) {
			ensureDesktopPreviewPlacement();
		}
		return;
	}

	const adjustedPlacement = manualRegistration.applyToPlacement(
		lastPlacementBase,
		manualPosition,
		manualOrientation
	);

	placedModel = placeModelAt(
		modelTemplate,
		placedModel,
		sceneBundle.modelAnchor,
		adjustedPlacement.position,
		adjustedPlacement.orientation,
		adjustedPlacement.scale
	);

	updatePlacementSummary();

}

function updateManualRegistrationReadout(state: ManualRegistrationState): void {

	store.patch( {
		manualReadout: {
			positionText: formatManualPositionSummary( state.offset ),
			yawText: `${normalizeSignedDegrees( state.yawDeg ).toFixed( 0 )}deg`,
			scaleText: `${state.scaleMultiplier.toFixed( 3 )}x`
		}
	} );

}

function updateRegistrationMetrics(): void {

	if ( demoModelConfig === null || registrationSolution === null ) {
		return;
	}

	store.patch( {
		registrationMetrics: {
			gpsText: formatGeodetic( demoModelConfig.anchor.lat, demoModelConfig.anchor.lon, demoModelConfig.anchor.alt ),
			enuText: formatGeodetic(
				registrationSolution.siteOrigin.lat,
				registrationSolution.siteOrigin.lon,
				registrationSolution.siteOrigin.alt
			),
			rmsText: `${registrationSolution.modelToSite.rmsErrorMeters.toFixed( 3 )} m`
		}
	} );

}

function updatePlacementSummary(): void {

	store.patch( {
		placementSummary: placedModel === null
			? createDefaultPlacementSummaryState()
			: {
				positionText: formatVector3( placedModel.position ),
				quaternionText: formatQuaternion( placedModel.quaternion ),
				scaleText: formatVector3( placedModel.scale )
			}
	} );

}

function updateRegistrationStatusDetail(message: string): void {

	store.patch( { registrationStatusDetail: message } );

}

function ensureDesktopPreviewPlacement(): void {

	if ( isDesktopLayout() === false || modelTemplate === null || registrationSolution === null ) {
		return;
	}

	const previewBase: ManualPlacementBase = {
		position: new THREE.Vector3(),
		orientation: registrationSolution.modelToSite.rotation.clone(),
		scale: getPlacementResidualScale( modelTemplate, registrationSolution.modelToSite.scale )
	};

	lastPlacementBase = previewBase;
	const adjustedPlacement = manualRegistration.applyToPlacement(
		previewBase,
		manualPosition,
		manualOrientation
	);

	placedModel = placeModelAt(
		modelTemplate,
		placedModel,
		sceneBundle.modelAnchor,
		adjustedPlacement.position,
		adjustedPlacement.orientation,
		adjustedPlacement.scale
	);

	store.patch( { desktopPreviewBadge: '3D 预览区域 / 可拖拽旋转与缩放' } );
	updatePlacementSummary();

}

function updateDesktopSceneDecorations(): void {

	if ( isDesktopLayout() && desktopAxesAttached === false ) {
		sceneBundle.scene.add( desktopAxesHelper );
		desktopAxesAttached = true;
		return;
	}

	if ( isDesktopLayout() === false && desktopAxesAttached ) {
		sceneBundle.scene.remove( desktopAxesHelper );
		desktopAxesAttached = false;
	}

}

function fitDesktopPreviewCamera(): void {

	if ( isDesktopLayout() === false || placedModel === null ) {
		return;
	}

	previewBounds.setFromObject( placedModel );
	if ( previewBounds.isEmpty() ) {
		return;
	}

	previewBounds.getCenter( previewCenter );
	previewBounds.getSize( previewSize );
	previewBounds.getBoundingSphere( previewSphere );

	const verticalHalfFov = THREE.MathUtils.degToRad( sceneBundle.camera.fov * 0.5 );
	const horizontalHalfFov = Math.atan( Math.tan( verticalHalfFov ) * sceneBundle.camera.aspect );
	const limitingHalfFov = Math.min( verticalHalfFov, horizontalHalfFov );
	const radius = Math.max( previewSphere.radius, 0.25 );
	const fitDistance = ( radius / Math.sin( limitingHalfFov ) ) * 1.12;

	previewTarget.copy( previewCenter );
	sceneBundle.controls.target.copy( previewTarget );

	sceneBundle.camera.position
		.copy( previewTarget )
		.addScaledVector( previewCameraDirection.clone().normalize(), fitDistance );
	sceneBundle.camera.near = Math.max( radius / 100, 0.01 );
	sceneBundle.camera.far = Math.max( fitDistance * 12, 50 );
	sceneBundle.camera.updateProjectionMatrix();

	sceneBundle.controls.minDistance = Math.max( radius * 0.35, 0.25 );
	sceneBundle.controls.maxDistance = Math.max( fitDistance * 4.5, 8 );
	sceneBundle.controls.update();

}

function updateDesktopInteractionState(): void {

	sceneBundle.controls.enabled = isDesktopLayout() && sceneBundle.renderer.xr.isPresenting === false;

}

function syncCanvasHost(): void {

	const targetHost = isDesktopLayout() ? dom.desktopCanvasContainer : dom.canvasContainer;
	if ( sceneBundle.renderer.domElement.parentElement !== targetHost ) {
		targetHost.appendChild( sceneBundle.renderer.domElement );
	}

	updateDesktopInteractionState();
	resizeARScene( sceneBundle.camera, sceneBundle.renderer, targetHost );

}

function onWindowResize(): void {

	resizeARScene( sceneBundle.camera, sceneBundle.renderer, sceneBundle.renderer.domElement.parentElement );
	if ( isDesktopLayout() ) {
		updateDesktopSceneDecorations();
	}

}

function isDesktopLayout(): boolean {

	return DESKTOP_MEDIA_QUERY.matches;

}

function formatManualPositionSummary(offset: THREE.Vector3): string {

	const xLabel = offset.x >= 0 ? '右移' : '左移';
	const yLabel = offset.y >= 0 ? '上移' : '下移';
	const zLabel = offset.z <= 0 ? '前移' : '后移';

	return `${xLabel} ${Math.abs( offset.x ).toFixed( 2 )}m / ${yLabel} ${Math.abs( offset.y ).toFixed( 2 )}m / ${zLabel} ${Math.abs( offset.z ).toFixed( 2 )}m`;

}

function formatGeodetic(lat: number, lon: number, alt: number): string {

	return `${lat.toFixed( 6 )}, ${lon.toFixed( 6 )}, ${alt.toFixed( 2 )}m`;

}

function formatVector3(vector: THREE.Vector3): string {

	return `(${vector.x.toFixed( 3 )}, ${vector.y.toFixed( 3 )}, ${vector.z.toFixed( 3 )})`;

}

function formatQuaternion(quaternion: THREE.Quaternion): string {

	return `(${quaternion.x.toFixed( 3 )}, ${quaternion.y.toFixed( 3 )}, ${quaternion.z.toFixed( 3 )}, ${quaternion.w.toFixed( 3 )})`;

}

function vectorToPlainObject(vector: THREE.Vector3): { x: number; y: number; z: number } {

	return {
		x: Number( vector.x.toFixed( 6 ) ),
		y: Number( vector.y.toFixed( 6 ) ),
		z: Number( vector.z.toFixed( 6 ) )
	};

}

function quaternionToPlainObject(quaternion: THREE.Quaternion): {
	x: number;
	y: number;
	z: number;
	w: number;
} {

	return {
		x: Number( quaternion.x.toFixed( 6 ) ),
		y: Number( quaternion.y.toFixed( 6 ) ),
		z: Number( quaternion.z.toFixed( 6 ) ),
		w: Number( quaternion.w.toFixed( 6 ) )
	};

}

function normalizeSignedDegrees(value: number): number {

	return value > 180 ? value - 360 : value;

}

function getTimeLabel(): string {

	const now = new Date();
	return now.toLocaleTimeString( 'zh-CN', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	} );

}
