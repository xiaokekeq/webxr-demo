import React, {
	useEffect,
	useLayoutEffect,
	useRef,
	useSyncExternalStore
} from 'react';
import type {
	DisplayMode,
	WorkspaceMode
} from '../data/registration-store.js';
import type {
	LoadModelArController,
	LoadModelArControllerState,
	RegistrationView
} from '../controller/load-model-ar-controller.js';
import './styles.css';

const DISPLAY_MODE_OPTIONS: Array<{ value: DisplayMode; label: string }> = [
	{ value: 'normal', label: '普通叠加' },
	{ value: 'xray', label: '透视核查' },
	{ value: 'occlusion-outline', label: '遮挡辅助' }
];

const PANEL_OPTIONS: Array<{ value: WorkspaceMode; label: string; short: string }> = [
	{ value: 'browse', label: '浏览', short: '览' },
	{ value: 'registration', label: '配准', short: '配' },
	{ value: 'tools', label: '工具', short: '工' },
	{ value: 'inspection', label: '核查', short: '核' }
];

function useControllerState(controller: LoadModelArController): LoadModelArControllerState {

	return useSyncExternalStore(
		controller.subscribe,
		controller.getState,
		controller.getState
	);

}

function useDesktopLayout(): boolean {

	const query = '(any-pointer: fine)';
	const subscribe = (listener: () => void): (() => void) => {
		const media = window.matchMedia( query );
		media.addEventListener( 'change', listener );
		return () => {
			media.removeEventListener( 'change', listener );
		};
	};

	const getSnapshot = (): boolean => window.matchMedia( query ).matches;
	return useSyncExternalStore( subscribe, getSnapshot, () => false );

}

function getDisplayModeLabel(mode: DisplayMode): string {

	return DISPLAY_MODE_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '普通叠加';

}

function getWorkspaceLabel(mode: WorkspaceMode): string {

	return PANEL_OPTIONS.find( ( item ) => item.value === mode )?.label ?? '浏览';

}

function getPhaseLabel(phase: LoadModelArControllerState['engine']['arSessionPhase']): string {

	switch ( phase ) {
		case 'scanning':
			return '扫描中';
		case 'ready-to-place':
			return '可放置';
		case 'placing':
			return '放置中';
		case 'placed':
			return '已放置';
	}

}

function getSupportLabel(state: LoadModelArControllerState['engine']['arSupportState']): string {

	switch ( state ) {
		case 'checking':
			return '检测中';
		case 'supported':
			return '支持 AR';
		case 'unsupported':
			return '不支持 AR';
	}

}

function getGuidanceContent(
	phase: LoadModelArControllerState['engine']['arSessionPhase']
): { title: string; body: string } {

	if ( phase === 'ready-to-place' ) {
		return {
			title: '已识别到平面',
			body: '确认目标位置稳定后，点击开始放置模型。'
		};
	}

	if ( phase === 'placing' ) {
		return {
			title: '正在放置模型',
			body: '系统正在结合 hit-test 与粗配准结果生成初始位置。'
		};
	}

	return {
		title: '正在识别平面',
		body: '缓慢移动手机，让地面或墙面持续出现在画面中。'
	};

}

function PanelSection(props: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}): React.JSX.Element {

	return (
		<section className="panel-section">
			<div className="panel-section__header">
				<h3>{props.title}</h3>
				{props.subtitle ? <p>{props.subtitle}</p> : null}
			</div>
			{props.children}
		</section>
	);

}

function SelectField(props: {
	label: string;
	value: string;
	onChange(value: string): void;
	options: Array<{ value: string; label: string }>;
}): React.JSX.Element {

	return (
		<label className="field">
			<span>{props.label}</span>
			<select value={props.value} onChange={ ( event ) => props.onChange( event.target.value ) }>
				{props.options.map( ( option ) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				) )}
			</select>
		</label>
	);

}

function ActionButton(props: {
	label: string;
	onClick(): void;
	kind?: 'primary' | 'secondary';
	disabled?: boolean;
}): React.JSX.Element {

	return (
		<button
			className={ `action-button${props.kind === 'primary' ? ' action-button--primary' : ''}${props.kind === 'secondary' ? ' action-button--secondary' : ''}` }
			type="button"
			onClick={props.onClick}
			disabled={props.disabled}
		>
			{props.label}
		</button>
	);

}

function BrowsePanel(props: {
	state: LoadModelArControllerState;
	controller: LoadModelArController;
	canInspect: boolean;
	showDisplayModeSection?: boolean;
}): React.JSX.Element {

	const {
		state,
		controller,
		canInspect,
		showDisplayModeSection = true
	} = props;
	const engine = state.engine;
	const ui = state.ui;
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';

	return (
		<div className="panel-stack">
			<PanelSection title="显示模式" subtitle="在普通叠加、透视核查和遮挡辅助之间切换。">
				<SelectField
					label="模式"
					value={engine.displayMode}
					onChange={ ( value ) => controller.actions.setDisplayMode( value as DisplayMode ) }
					options={DISPLAY_MODE_OPTIONS}
				/>
			</PanelSection>

			<PanelSection title="模型与阶段">
				<div className="field-grid">
					<SelectField
						label="模型"
						value={engine.selectedModelId}
						onChange={controller.actions.selectModel}
						options={engine.availableModels.map( ( item ) => ( {
							value: item.id,
							label: item.name
						} ) )}
					/>
					<div className="field">
						<span>当前阶段</span>
						<div className="value-chip">{currentStage}</div>
					</div>
				</div>

				<div className="chip-list">
					{engine.layerNames.map( ( item ) => (
						<span key={item} className="chip">{item}</span>
					) )}
				</div>

				<div className="stage-grid">
					{engine.timelineStages.map( ( item, index ) => (
						<button
							key={item}
							className={ `stage-button${index === engine.currentTimelineStageIndex ? ' is-active' : ''}` }
							type="button"
							onClick={ () => controller.actions.setTimelineStage( index ) }
						>
							{item}
						</button>
					) )}
				</div>

				<div className="button-row button-row--triple">
					<ActionButton label="上一阶段" onClick={controller.actions.timelinePrev} />
					<ActionButton label="播放" onClick={controller.actions.timelinePlay} kind="primary" />
					<ActionButton label="下一阶段" onClick={controller.actions.timelineNext} />
				</div>
			</PanelSection>

			<PanelSection title="当前构件" subtitle={engine.hasSelection ? '已选中构件，可继续核查。' : '点选模型构件后，这里会显示详情。'}>
				<div className="summary-grid">
					<div className="summary-card">
						<strong>名称</strong>
						<span>{engine.hasSelection ? engine.propertyPanel.name : '未选择'}</span>
					</div>
					<div className="summary-card">
						<strong>状态</strong>
						<span>{engine.hasSelection ? engine.propertyPanel.status : getDisplayModeLabel( engine.displayMode )}</span>
					</div>
				</div>

				{ui.browseDetailsExpanded ? (
					<div className="detail-grid">
						<div><strong>类型</strong><span>{engine.propertyPanel.type}</span></div>
						<div><strong>尺寸</strong><span>{engine.propertyPanel.diameter}</span></div>
						<div><strong>材质</strong><span>{engine.propertyPanel.material}</span></div>
						<div><strong>高程/深度</strong><span>{engine.propertyPanel.depth}</span></div>
					</div>
				) : null}

				<p className="note-block">
					{engine.hasSelection ? engine.propertyPanel.remark : '这里负责显示模式、图层与阶段浏览；选中构件后可以进入核查。'}
				</p>

				<div className="button-row">
					<ActionButton
						label={ui.browseDetailsExpanded ? '收起详情' : '查看详情'}
						onClick={ () => controller.actions.setBrowseDetailsExpanded( !ui.browseDetailsExpanded ) }
						disabled={!engine.hasSelection}
					/>
					<ActionButton
						label="进入核查"
						onClick={ () => controller.actions.activatePanel( 'inspection' ) }
						kind="secondary"
						disabled={!canInspect}
					/>
					{engine.hasSelection ? (
						<ActionButton label="关闭" onClick={controller.actions.closePropertyPanel} kind="secondary" />
					) : null}
				</div>
			</PanelSection>
		</div>
	);

}

function RegistrationPanel(props: {
	state: LoadModelArControllerState;
	controller: LoadModelArController;
}): React.JSX.Element {

	const { state, controller } = props;
	const engine = state.engine;
	const ui = state.ui;
	const placed = engine.arSessionPhase === 'placed' || engine.appMode === 'pre-ar';

	return (
		<div className="panel-stack">
			<PanelSection title="当前状态" subtitle="粗配准、精配准和微调都从这里进入。">
				<div className="summary-grid">
					<div className="summary-card">
						<strong>状态</strong>
						<span>{getPhaseLabel( engine.arSessionPhase )}</span>
					</div>
					<div className="summary-card">
						<strong>RMS</strong>
						<span>{engine.precisionRegistration.rmsText === '--' ? engine.registrationMetrics.rmsText : engine.precisionRegistration.rmsText}</span>
					</div>
				</div>

				<div className="button-row">
					<ActionButton label="重新放置" onClick={controller.actions.resetPlacement} kind="primary" />
					<ActionButton label="重新粗配准" onClick={ () => void controller.actions.enableCoarseRegistration() } />
					<ActionButton label="刷新定位" onClick={ () => void controller.actions.refreshGeoLocation() } />
				</div>

				<div className="button-row">
					<ActionButton label="手动微调" onClick={ () => controller.actions.setRegistrationView( 'manual' ) } kind={ui.registrationView === 'manual' ? 'primary' : undefined} disabled={!placed} />
					<ActionButton label="控制点配准" onClick={ () => controller.actions.setRegistrationView( 'control' ) } kind={ui.registrationView === 'control' ? 'primary' : undefined} disabled={!placed} />
					<ActionButton label="导出快照" onClick={controller.actions.exportRegistrationSnapshot} kind="secondary" />
				</div>

				<div className="button-row">
					<ActionButton label="保存配准" onClick={controller.actions.saveManualRegistration} kind="primary" disabled={!placed} />
					<ActionButton label="重置微调" onClick={controller.actions.resetManualRegistration} kind="secondary" disabled={!placed} />
					<ActionButton label="清除已保存配准" onClick={controller.actions.clearSavedRegistration} kind="secondary" disabled={!placed} />
				</div>
			</PanelSection>

			{ui.registrationView === 'manual' ? (
				<PanelSection title="手动微调" subtitle="平移、旋转和尺度调整都通过引擎控制。">
					<div className="manual-grid">
						<ActionButton label="前移" onClick={ () => controller.actions.adjustTranslation( 'z', -1 ) } />
						<ActionButton label="左移" onClick={ () => controller.actions.adjustTranslation( 'x', -1 ) } />
						<ActionButton label="上移" onClick={ () => controller.actions.adjustTranslation( 'y', 1 ) } />
						<ActionButton label="右移" onClick={ () => controller.actions.adjustTranslation( 'x', 1 ) } />
						<ActionButton label="后移" onClick={ () => controller.actions.adjustTranslation( 'z', 1 ) } />
						<ActionButton label="下移" onClick={ () => controller.actions.adjustTranslation( 'y', -1 ) } />
					</div>
					<div className="button-row">
						<ActionButton label="左旋" onClick={ () => controller.actions.adjustYaw( -1 ) } />
						<ActionButton label="右旋" onClick={ () => controller.actions.adjustYaw( 1 ) } />
						<ActionButton label="缩小" onClick={ () => controller.actions.adjustScale( -1 ) } />
						<ActionButton label="放大" onClick={ () => controller.actions.adjustScale( 1 ) } />
					</div>
					<p className="note-block">
						位置: {engine.manualReadout.positionText}<br />
						角度: {engine.manualReadout.yawText}<br />
						尺度: {engine.manualReadout.scaleText}
					</p>
				</PanelSection>
			) : null}

			{ui.registrationView === 'control' ? (
				<PanelSection title="控制点配准" subtitle="先选择模型控制点，再确认现场控制点。">
					<SelectField
						label="模型控制点"
						value={engine.precisionRegistration.selectedSourcePoint}
						onChange={controller.actions.selectPrecisionSourcePoint}
						options={[
							{ value: '', label: '请选择模型控制点' },
							...engine.precisionRegistration.availableSourcePoints.map( ( point ) => ( {
								value: point,
								label: point
							} ) )
						]}
					/>
					<div className="button-row">
						<ActionButton label="选择模型点" onClick={controller.actions.armPrecisionSourcePoint} />
						<ActionButton label="确认现实点" onClick={controller.actions.confirmPrecisionTargetPoint} />
					</div>
					<p className="note-block">
						模型点: {engine.precisionRegistration.stagedSourcePoint}<br />
						现实点: {engine.precisionRegistration.stagedTargetPoint}<br />
						点对: {engine.precisionRegistration.pairSummaries.length} / 建议至少 4 组<br />
						RMS: {engine.precisionRegistration.rmsText}
					</p>
					<div className="button-row">
						<ActionButton label="加入点对" onClick={controller.actions.addPrecisionPair} kind="secondary" />
						<ActionButton label="计算配准" onClick={controller.actions.solvePrecisionRegistration} kind="primary" />
						<ActionButton label="保存结果" onClick={controller.actions.savePrecisionRegistration} />
						<ActionButton label="清空" onClick={controller.actions.clearPrecisionPairs} />
					</div>
					<div className="list-block">
						{engine.precisionRegistration.pairSummaries.length === 0 ? (
							<div className="list-item">还没有采集控制点对。</div>
						) : engine.precisionRegistration.pairSummaries.map( ( item ) => (
							<div key={item} className="list-item">{item}</div>
						) )}
					</div>
				</PanelSection>
			) : null}
		</div>
	);

}

function ToolsPanel(props: {
	controller: LoadModelArController;
}): React.JSX.Element {

	const { controller } = props;

	return (
		<div className="panel-stack">
			<PanelSection title="测量" subtitle="先用占位动作打通工具入口，后续可以接真实测量逻辑。">
				<div className="button-row">
					<ActionButton label="两点测距" onClick={ () => controller.actions.runMeasurementTool( '两点测距' ) } />
					<ActionButton label="高差测量" onClick={ () => controller.actions.runMeasurementTool( '高差测量' ) } />
					<ActionButton label="模型偏差" onClick={ () => controller.actions.runMeasurementTool( '模型偏差测量' ) } kind="secondary" />
					<ActionButton label="清除测量" onClick={ () => controller.actions.runMeasurementTool( '清除测量' ) } kind="secondary" />
				</div>
			</PanelSection>

			<PanelSection title="截图">
				<div className="button-row">
					<ActionButton label="当前画面" onClick={controller.actions.takeSnapshot} />
					<ActionButton label="带模型信息" onClick={controller.actions.takeSnapshot} kind="secondary" />
				</div>
			</PanelSection>

			<PanelSection title="标注与辅助">
				<div className="button-row">
					<ActionButton label="添加标注" onClick={ () => controller.actions.toggleAnnotationHelper( '添加标注' ) } />
					<ActionButton label="显示控制点" onClick={ () => controller.actions.toggleAnnotationHelper( '显示控制点' ) } kind="secondary" />
				</div>
			</PanelSection>
		</div>
	);

}

function InspectionPanel(props: {
	state: LoadModelArControllerState;
	controller: LoadModelArController;
}): React.JSX.Element {

	const { state, controller } = props;
	const engine = state.engine;
	const draft = state.ui.inspectionDraft;

	return (
		<div className="panel-stack">
			<PanelSection title="当前选中对象" subtitle="点击模型构件后，这里会带出当前对象信息。">
				<div className="summary-grid">
					<div className="summary-card">
						<strong>构件名称</strong>
						<span>{engine.hasSelection ? engine.propertyPanel.name : '未选择'}</span>
					</div>
					<div className="summary-card">
						<strong>构件类型</strong>
						<span>{engine.hasSelection ? engine.propertyPanel.type : '-'}</span>
					</div>
					<div className="summary-card">
						<strong>当前状态</strong>
						<span>{engine.hasSelection ? engine.propertyPanel.status : '-'}</span>
					</div>
				</div>

				<div className="button-row">
					<ActionButton label="编辑记录" onClick={ () => controller.actions.setInspectionFormExpanded( true ) } kind="primary" />
					<ActionButton label="收起表单" onClick={ () => controller.actions.setInspectionFormExpanded( false ) } kind="secondary" />
				</div>
			</PanelSection>

			{state.ui.inspectionFormExpanded ? (
				<PanelSection title="核查记录">
					<div className="field-grid">
						<SelectField
							label="核查状态"
							value={draft.result}
							onChange={ ( value ) => controller.actions.updateInspectionDraft( { result: value } ) }
							options={[
								{ value: '正常', label: '正常' },
								{ value: '异常', label: '异常' },
								{ value: '待复核', label: '待复核' }
							]}
						/>
						<SelectField
							label="问题类型"
							value={draft.type}
							onChange={ ( value ) => controller.actions.updateInspectionDraft( { type: value } ) }
							options={[
								{ value: '位置偏差', label: '位置偏差' },
								{ value: '高程异常', label: '高程异常' },
								{ value: '材料不符', label: '材料不符' },
								{ value: '标识问题', label: '标识问题' }
							]}
						/>
						<SelectField
							label="严重程度"
							value={draft.severity}
							onChange={ ( value ) => controller.actions.updateInspectionDraft( { severity: value } ) }
							options={[
								{ value: '一般', label: '一般' },
								{ value: '重要', label: '重要' },
								{ value: '紧急', label: '紧急' }
							]}
						/>
					</div>

					<label className="field">
						<span>备注</span>
						<textarea
							value={draft.note}
							onChange={ ( event ) => controller.actions.updateInspectionDraft( { note: event.target.value } ) }
							placeholder="请输入问题描述、核查结论或现场情况。"
						/>
					</label>

					<div className="button-row">
						<ActionButton label="拍照" onClick={controller.actions.takeSnapshot} />
						<ActionButton label="保存记录" onClick={controller.actions.saveInspectionRecord} kind="primary" />
						<ActionButton label="导出记录" onClick={controller.actions.exportInspectionRecords} kind="secondary" />
					</div>
				</PanelSection>
			) : null}
		</div>
	);

}

function MobileArShell(props: {
	state: LoadModelArControllerState;
	controller: LoadModelArController;
	canvasRef: React.RefObject<HTMLDivElement | null>;
	xrButtonRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, controller, canvasRef, xrButtonRef } = props;
	const engine = state.engine;
	const guidance = getGuidanceContent( engine.arSessionPhase );
	const showPlacementUi = engine.arSessionPhase === 'scanning' || engine.arSessionPhase === 'ready-to-place';
	const canInspect = engine.arSessionPhase === 'placed';

	return (
		<div className="mobile-ar-root">
			<div ref={canvasRef} className="scene-host scene-host--fullscreen" />
			<div ref={xrButtonRef} className="xr-button-wrap" />

			<div
				className="mobile-overlay"
				data-ar-ui="true"
				onPointerDownCapture={controller.actions.handleArUiInteraction}
				onPointerUpCapture={controller.actions.handleArUiInteraction}
			>
				<header className="topbar">
					<div>
						<div className="topbar__title">{engine.projectName}</div>
						<div className="topbar__subtitle">
							{getWorkspaceLabel( engine.workspaceMode )} / {getPhaseLabel( engine.arSessionPhase )} / RMS {engine.precisionRegistration.rmsText === '--' ? engine.registrationMetrics.rmsText : engine.precisionRegistration.rmsText}
						</div>
					</div>
					<div className="status-pill">{getPhaseLabel( engine.arSessionPhase )}</div>
				</header>

				{showPlacementUi ? (
					<div className="guidance-card">
						<h2>{guidance.title}</h2>
						<p>{guidance.body}</p>
					</div>
				) : null}

				<div className="quick-tools">
					<button className="tool-button" type="button" onClick={controller.actions.cycleDisplayMode}>显示</button>
					<button className="tool-button" type="button" onClick={controller.actions.takeSnapshot}>截图</button>
					<button className="tool-button" type="button" onClick={controller.actions.toggleDrawer}>面板</button>
				</div>

				{showPlacementUi ? (
					<div className="primary-bar">
						<ActionButton label="退出 AR" onClick={controller.actions.exitAr} kind="secondary" />
						<ActionButton label={engine.arSessionPhase === 'ready-to-place' ? '开始放置' : '等待平面'} onClick={ () => void controller.actions.placeModel() } kind="primary" disabled={engine.arSessionPhase !== 'ready-to-place'} />
					</div>
				) : null}

				<div className={ `drawer-anchor${state.ui.drawerOpen ? '' : ' is-collapsed'}` }>
					<div className="drawer-card">
						{engine.workspaceMode === 'browse' ? <BrowsePanel state={state} controller={controller} canInspect={canInspect} /> : null}
						{engine.workspaceMode === 'registration' ? <RegistrationPanel state={state} controller={controller} /> : null}
						{engine.workspaceMode === 'tools' ? <ToolsPanel controller={controller} /> : null}
						{engine.workspaceMode === 'inspection' ? <InspectionPanel state={state} controller={controller} /> : null}
					</div>
				</div>

				<button className="drawer-toggle" type="button" onClick={controller.actions.toggleDrawer}>
					<span>{state.ui.drawerOpen ? '收起面板' : `展开${getWorkspaceLabel( engine.workspaceMode )}`}</span>
				</button>

				<nav className="bottom-nav">
					{PANEL_OPTIONS.map( ( item ) => (
						<button
							key={item.value}
							className={ `nav-button${engine.workspaceMode === item.value ? ' is-active' : ''}` }
							type="button"
							onClick={ () => controller.actions.activatePanel( item.value ) }
							disabled={item.value !== 'registration' && !canInspect}
						>
							<span className="nav-button__icon">{item.short}</span>
							<span>{item.label}</span>
						</button>
					) )}
				</nav>
			</div>
		</div>
	);

}

function MobilePreArShell(props: {
	state: LoadModelArControllerState;
	controller: LoadModelArController;
	canvasRef: React.RefObject<HTMLDivElement | null>;
	xrButtonRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, controller, canvasRef, xrButtonRef } = props;
	const engine = state.engine;
	const currentModelName = engine.availableModels.find( ( item ) => item.id === engine.selectedModelId )?.name ?? '-';
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';

	return (
		<div className="mobile-pre-ar">
			<div ref={xrButtonRef} className="xr-button-wrap" />
			<div className="page-card">
				<h1>{engine.projectName}</h1>
				<div className="meta-list">
					<div><strong>模型</strong><span>{currentModelName}</span></div>
					<div><strong>阶段</strong><span>{currentStage}</span></div>
					<div><strong>显示</strong><span>{getDisplayModeLabel( engine.displayMode )}</span></div>
				</div>
			</div>

			<div className="page-card">
				<div className="preview-header">
					<div>
						<h2>预览</h2>
						<p>{engine.desktopPreviewBadge}</p>
					</div>
					<div className={ `support-badge support-badge--${engine.arSupportState}` }>{getSupportLabel( engine.arSupportState )}</div>
				</div>
				<div ref={canvasRef} className="scene-host scene-host--preview" />
				<p className="support-copy">{engine.arSupportMessage}</p>
			</div>

			<div className="page-card">
				<div className="field-grid">
					<SelectField
						label="模型选择"
						value={engine.selectedModelId}
						onChange={controller.actions.selectModel}
						options={engine.availableModels.map( ( item ) => ( {
							value: item.id,
							label: item.name
						} ) )}
					/>
					<SelectField
						label="默认显示模式"
						value={engine.displayMode}
						onChange={ ( value ) => controller.actions.setDisplayMode( value as DisplayMode ) }
						options={DISPLAY_MODE_OPTIONS}
					/>
				</div>

				<div className="stage-grid">
					{engine.timelineStages.map( ( item, index ) => (
						<button
							key={item}
							className={ `stage-button${index === engine.currentTimelineStageIndex ? ' is-active' : ''}` }
							type="button"
							onClick={ () => controller.actions.setTimelineStage( index ) }
						>
							{item}
						</button>
					) )}
				</div>

				<div className="chip-list">
					{engine.layerNames.map( ( item ) => (
						<span key={item} className="chip">{item}</span>
					) )}
				</div>

				<ActionButton
					label="进入 AR"
					onClick={controller.actions.enterAr}
					kind="primary"
					disabled={engine.arSupportState !== 'supported'}
				/>
			</div>
		</div>
	);

}

function DesktopShell(props: {
	state: LoadModelArControllerState;
	controller: LoadModelArController;
	canvasRef: React.RefObject<HTMLDivElement | null>;
	xrButtonRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, controller, canvasRef, xrButtonRef } = props;
	const engine = state.engine;
	const currentModelName = engine.availableModels.find( ( item ) => item.id === engine.selectedModelId )?.name ?? '-';

	return (
		<div className="desktop-shell">
			<div ref={xrButtonRef} className="xr-button-wrap" />

			<header className="desktop-header">
				<div>
					<h1>{engine.projectName}</h1>
					<p>{currentModelName} / {getDisplayModeLabel( engine.displayMode )} / {engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-'}</p>
				</div>
				<div className="desktop-header__meta">
					<span className={ `support-badge support-badge--${engine.arSupportState}` }>{getSupportLabel( engine.arSupportState )}</span>
					<span className="status-pill">{engine.currentStatus}</span>
				</div>
			</header>

			<div className="desktop-grid">
				<aside className="desktop-panel">
					<PanelSection title="准备信息" subtitle="桌面端用于预览、选模和查看状态。">
						<SelectField
							label="模型选择"
							value={engine.selectedModelId}
							onChange={controller.actions.selectModel}
							options={engine.availableModels.map( ( item ) => ( {
								value: item.id,
								label: item.name
							} ) )}
						/>
						<SelectField
							label="默认显示模式"
							value={engine.displayMode}
							onChange={ ( value ) => controller.actions.setDisplayMode( value as DisplayMode ) }
							options={DISPLAY_MODE_OPTIONS}
						/>
						<div className="summary-grid">
							<div className="summary-card"><strong>AR 状态</strong><span>{getSupportLabel( engine.arSupportState )}</span></div>
							<div className="summary-card"><strong>RMS</strong><span>{engine.precisionRegistration.rmsText === '--' ? engine.registrationMetrics.rmsText : engine.precisionRegistration.rmsText}</span></div>
						</div>
						<p className="note-block">{engine.arSupportMessage}</p>
						<div className="button-row">
							<ActionButton label="进入 AR" onClick={controller.actions.enterAr} kind="primary" disabled={engine.arSupportState !== 'supported'} />
							<ActionButton label="导出快照" onClick={controller.actions.exportRegistrationSnapshot} kind="secondary" />
						</div>
					</PanelSection>
				</aside>

				<section className="desktop-preview">
					<div className="desktop-preview__badge">{engine.desktopPreviewBadge}</div>
					<div ref={canvasRef} className="scene-host scene-host--desktop" />
				</section>

				<aside className="desktop-panel">
					<div className="desktop-tabs">
						{PANEL_OPTIONS.map( ( item ) => (
							<button
								key={item.value}
								className={ `desktop-tab${engine.workspaceMode === item.value ? ' is-active' : ''}` }
								type="button"
								onClick={ () => controller.actions.activatePanel( item.value ) }
							>
								{item.label}
							</button>
						) )}
					</div>

					<div className="desktop-panel__body">
						{engine.workspaceMode === 'browse' ? (
							<div className="desktop-browse-panel">
								<BrowsePanel state={state} controller={controller} canInspect={true} />
							</div>
						) : null}
						{engine.workspaceMode === 'registration' ? <RegistrationPanel state={state} controller={controller} /> : null}
						{engine.workspaceMode === 'tools' ? <ToolsPanel controller={controller} /> : null}
						{engine.workspaceMode === 'inspection' ? <InspectionPanel state={state} controller={controller} /> : null}
					</div>
				</aside>
			</div>
		</div>
	);

}

export function LoadModelArApp(props: {
	controller: LoadModelArController;
}): React.JSX.Element {

	const { controller } = props;
	const state = useControllerState( controller );
	const isDesktopLayout = useDesktopLayout();
	const arCanvasRef = useRef<HTMLDivElement | null>( null );
	const preArCanvasRef = useRef<HTMLDivElement | null>( null );
	const desktopCanvasRef = useRef<HTMLDivElement | null>( null );
	const xrButtonRef = useRef<HTMLDivElement | null>( null );

	useEffect( () => {
		void controller.initialize();
		return () => {
			controller.dispose();
		};
	}, [ controller ] );

	useEffect( () => {
		controller.setLayoutMode( isDesktopLayout );
	}, [ controller, isDesktopLayout ] );

	useLayoutEffect( () => {
		if (
			arCanvasRef.current === null
			|| preArCanvasRef.current === null
			|| desktopCanvasRef.current === null
			|| xrButtonRef.current === null
		) {
			return;
		}

		controller.mountHosts( {
			arCanvasHost: arCanvasRef.current,
			preArCanvasHost: preArCanvasRef.current,
			desktopCanvasHost: desktopCanvasRef.current,
			xrButtonHost: xrButtonRef.current
		} );
	}, [ controller, state.engine.appMode, isDesktopLayout ] );

	if ( isDesktopLayout ) {
		return (
			<>
				<div ref={arCanvasRef} className="scene-host scene-host--hidden" />
				<div ref={preArCanvasRef} className="scene-host scene-host--hidden" />
				<DesktopShell
					state={state}
					controller={controller}
					canvasRef={desktopCanvasRef}
					xrButtonRef={xrButtonRef}
				/>
			</>
		);
	}

	if ( state.engine.appMode === 'ar-session' ) {
		return (
			<>
				<div ref={preArCanvasRef} className="scene-host scene-host--hidden" />
				<div ref={desktopCanvasRef} className="scene-host scene-host--hidden" />
				<MobileArShell
					state={state}
					controller={controller}
					canvasRef={arCanvasRef}
					xrButtonRef={xrButtonRef}
				/>
			</>
		);
	}

	return (
		<>
			<div ref={arCanvasRef} className="scene-host scene-host--hidden" />
			<div ref={desktopCanvasRef} className="scene-host scene-host--hidden" />
			<MobilePreArShell
				state={state}
				controller={controller}
				canvasRef={preArCanvasRef}
				xrButtonRef={xrButtonRef}
			/>
		</>
	);

}
