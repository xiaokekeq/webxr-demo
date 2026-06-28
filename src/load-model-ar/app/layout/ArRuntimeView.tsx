import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import {
	PANEL_OPTIONS,
	getDisplayModeLabel,
	getGuidanceContent,
	getPhaseLabel,
	getWorkspaceLabel
} from '../store/selectors.js';
import { ArCanvas } from './ArCanvas.js';
import { ArStatusBar } from './ArStatusBar.js';
import { BottomDrawer } from './BottomDrawer.js';
import { ManualAdjustmentOverlay } from './ManualAdjustmentOverlay.js';
import { ActionButton } from '../components/ActionButton.js';
import { GuardedPressButton } from '../components/GuardedPressButton.js';
import { BrowsePanel } from '../panels/BrowsePanel.js';
import { RegistrationPanel } from '../panels/RegistrationPanel.js';
import { ToolsPanel } from '../panels/ToolsPanel.js';
import { InspectionPanel } from '../panels/InspectionPanel.js';
import { usePlacementGuidance } from './use-placement-guidance.js';

export function ArRuntimeView(props: {
	state: AppState;
	actions: AppActions;
	canvasRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, actions, canvasRef } = props;
	const engine = state.engine;
	const guidance = getGuidanceContent( engine.arSessionPhase );
	const showPlacementUi = engine.arSessionPhase === 'scanning' || engine.arSessionPhase === 'ready-to-place';
	const showGuidance = usePlacementGuidance( engine.arSessionPhase );
	const canInspect = engine.arSessionPhase === 'placed';
	const canOpenBrowse = engine.arSessionPhase === 'placed' || showPlacementUi;
	const canOpenTools = true;
	const placeActionLabel = engine.arSessionPhase === 'ready-to-place' ? '开始放置模型' : '继续扫描';
	const drawerToggleLabel = state.ui.drawerOpen
		? '收起面板'
		: `展开${getWorkspaceLabel( engine.workspaceMode )}`;
	const displayModeLabel = getDisplayModeLabel( engine.displayMode );
	const subtitle = `${getWorkspaceLabel( engine.workspaceMode )} / ${getPhaseLabel( engine.arSessionPhase )} / ${displayModeLabel} / RMS ${engine.registrationMetrics.rmsText}`;
	const showMeasurementCaptureOverlay = state.ui.measurementCaptureActive
		&& engine.workspaceMode === 'tools';
	const measurementCaptureActionLabel = `记录第 ${engine.measurement.capturedPointLabels.length + 1} 点`;
	const showCaptureOverlay = showMeasurementCaptureOverlay;
	const showTargetGuidance = engine.arSessionPhase === 'placed' && engine.targetGuidance.visible;
	const showManualAdjustmentOverlay = showCaptureOverlay === false
		&& engine.workspaceMode === 'registration'
		&& state.ui.registrationView === 'manual'
		&& engine.appMode === 'ar-session';
	const hiddenLayerCount = engine.modelLayers.filter( ( layer ) => layer.visible === false ).length;
	const visibleLayerCount = engine.modelLayers.length - hiddenLayerCount;
	const showLayerQuickBar = showCaptureOverlay === false
		&& showManualAdjustmentOverlay === false
		&& engine.arSessionPhase === 'placed'
		&& showTargetGuidance === false
		&& engine.modelLayers.length > 1;
	const cycleDirection = state.ui.layerCycleDirection;
	const cycleLayerLabel = cycleDirection === 'restore' ? '恢复上一层' : '隐藏上一层';
	const cycleLayerHint = cycleDirection === 'restore'
		? '当前正在逐层恢复模型显示，恢复完成后会回到继续剥离模式。'
		: '当前正在从上到下隐藏模型层，隐藏到底后会自动切换到恢复模式。';
	const showStructureReveal = showCaptureOverlay === false && showManualAdjustmentOverlay === false;

	return (
		<div className={ `mobile-ar-root${showPlacementUi ? ' mobile-ar-root--placement' : ''}` }>
			<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--fullscreen" />

			<div
				className="mobile-overlay"
				data-ar-ui="true"
				onPointerDownCapture={actions.handleArUiInteraction}
				onPointerUpCapture={actions.handleArUiInteraction}
			>
				{showCaptureOverlay ? null : (
					<ArStatusBar
						title={engine.projectName}
						subtitle={subtitle}
						status={engine.arSessionPhase === 'ready-to-place' ? '点击放置' : getPhaseLabel( engine.arSessionPhase )}
						onStatusClick={showPlacementUi ? () => void actions.placeModel() : undefined}
						statusDisabled={engine.arSessionPhase !== 'ready-to-place'}
					/>
				)}

				{showCaptureOverlay ? null : showPlacementUi && showGuidance ? (
					<div className="guidance-card">
						<h2>{guidance.title}</h2>
						<p>{guidance.body}</p>
						<div className="guidance-card__debug">{engine.coarseLocationDebugText}</div>
					</div>
				) : null}

				{showCaptureOverlay ? null : showTargetGuidance ? (
					<div className={ `target-guidance-card target-guidance-card--${engine.targetGuidance.alignment}` }>
						<div className="target-guidance-card__eyebrow">当前暂未看到模型</div>
						<div className="target-guidance-card__direction">{engine.targetGuidance.directionText}</div>
						<div className="target-guidance-card__distance">{engine.targetGuidance.distanceText}</div>
						<p>{engine.targetGuidance.detailText}</p>
						<div className="target-guidance-card__debug">{engine.coarseLocationDebugText}</div>
					</div>
				) : null}

				{showLayerQuickBar ? (
					<div className="layer-quickbar">
						<div className="layer-quickbar__summary">
							<strong>{`当前可见 ${visibleLayerCount} / ${engine.modelLayers.length} 层`}</strong>
							<span>{cycleLayerHint}</span>
						</div>
						<div className="layer-quickbar__actions">
							<ActionButton
								label={cycleLayerLabel}
								onClick={actions.cycleModelLayer}
								kind="primary"
							/>
							<ActionButton
								label="恢复全部"
								onClick={actions.resetModelLayers}
								kind="secondary"
								disabled={hiddenLayerCount === 0}
							/>
						</div>
					</div>
				) : null}

				{showManualAdjustmentOverlay ? <ManualAdjustmentOverlay state={state} actions={actions} /> : null}

				{showCaptureOverlay ? null : showPlacementUi ? (
					<div className="primary-bar">
						<ActionButton label="退出 AR" onClick={actions.exitAr} kind="secondary" />
						<ActionButton
							label={placeActionLabel}
							onClick={() => void actions.placeModel()}
							kind="primary"
							disabled={engine.arSessionPhase !== 'ready-to-place'}
						/>
					</div>
				) : null}

				{showCaptureOverlay || showManualAdjustmentOverlay ? null : (
					<BottomDrawer
						open={state.ui.drawerOpen}
						workspaceMode={engine.workspaceMode}
						onToggle={actions.toggleDrawer}
						toggleLabel={drawerToggleLabel}
					>
						{engine.workspaceMode === 'browse' ? <BrowsePanel state={state} actions={actions} canInspect={canInspect} /> : null}
						{engine.workspaceMode === 'registration' ? <RegistrationPanel state={state} actions={actions} /> : null}
						{engine.workspaceMode === 'tools' ? <ToolsPanel state={state} actions={actions} /> : null}
						{engine.workspaceMode === 'inspection' ? <InspectionPanel state={state} actions={actions} /> : null}
					</BottomDrawer>
				)}

				{showStructureReveal ? (
					<div className="ar-minimal-perspective">
						<input
							className="ar-minimal-perspective__slider"
							type="range"
							min={0}
							max={100}
							step={1}
							aria-label="结构显现"
							value={engine.structureRevealValue}
							onChange={ ( event ) => {
								actions.setStructureRevealValue( Number( event.currentTarget.value ) );
							} }
						/>
					</div>
				) : null}

				{showMeasurementCaptureOverlay ? (
					<div className="precision-capture-bar">
						<div className="precision-capture-bar__content">
							<strong>{`当前模式：${engine.measurement.activeLabel}`}</strong>
							<span>{`测点进度：${engine.measurement.capturedPointLabels.length} / ${engine.measurement.requiredPointCount}`}</span>
							<span>{`采样质量：${engine.measurement.targetQualityText}`}</span>
							<span>{engine.measurement.feedbackText || engine.measurement.detailText}</span>
						</div>
						<div className="precision-capture-bar__actions">
							<ActionButton
								label="取消测量"
								onClick={actions.cancelMeasurement}
								kind="secondary"
							/>
							<ActionButton
								label={measurementCaptureActionLabel}
								onClick={actions.confirmMeasurementPoint}
								kind="primary"
							/>
						</div>
					</div>
				) : (
					<nav className="bottom-nav">
						{PANEL_OPTIONS.map( ( item ) => (
							<GuardedPressButton
								key={item.value}
								className={ `nav-button${engine.workspaceMode === item.value ? ' is-active' : ''}` }
								onPress={ () => actions.activatePanel( item.value ) }
								disabled={
									( item.value === 'browse' && !canOpenBrowse )
									|| ( item.value === 'tools' && !canOpenTools )
									|| ( item.value === 'inspection' && !canInspect )
								}
							>
								<span className="nav-button__icon">{item.short}</span>
								<span>{item.label}</span>
							</GuardedPressButton>
						) )}
					</nav>
				)}
			</div>
		</div>
	);

}
