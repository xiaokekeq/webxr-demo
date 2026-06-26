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
import { StatusBadge } from '../components/StatusBadge.js';
import { BrowsePanel } from '../panels/BrowsePanel.js';
import { RegistrationPanel } from '../panels/RegistrationPanel.js';
import { ToolsPanel } from '../panels/ToolsPanel.js';
import { InspectionPanel } from '../panels/InspectionPanel.js';
import { usePlacementGuidance } from './use-placement-guidance.js';

export function ArRuntimeView(props: {
	state: AppState;
	actions: AppActions;
	canvasRef: React.RefObject<HTMLDivElement | null>;
	xrButtonRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, actions, canvasRef, xrButtonRef } = props;
	const engine = state.engine;
	const guidance = getGuidanceContent( engine.arSessionPhase );
	const showPlacementUi = engine.arSessionPhase === 'scanning' || engine.arSessionPhase === 'ready-to-place';
	const showGuidance = usePlacementGuidance( engine.arSessionPhase );
	const canInspect = engine.arSessionPhase === 'placed';
	const canOpenBrowse = engine.arSessionPhase === 'placed' || showPlacementUi;
	const canOpenTools = true;
	const placeActionLabel = engine.arSessionPhase === 'ready-to-place' ? '开始放置' : '继续扫描';
	const drawerToggleLabel = state.ui.drawerOpen ? '收起面板' : `展开${getWorkspaceLabel( engine.workspaceMode )}`;
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

	return (
		<div className={ `mobile-ar-root${showPlacementUi ? ' mobile-ar-root--placement' : ''}` }>
			<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--fullscreen" />
			<div ref={xrButtonRef} className="xr-button-wrap" />

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

				{showCaptureOverlay ? null : (
					<div className="ar-depth-debug" data-ar-ui="true">
						<div className="ar-depth-debug__row">
							<StatusBadge label={engine.depthDebug.label} tone={engine.depthDebug.tone} />
							<span className="ar-depth-debug__title">Depth 调试</span>
						</div>
						<div className="ar-depth-debug__detail">{engine.depthDebug.detail}</div>
					</div>
				)}

				{showCaptureOverlay ? null : showPlacementUi && showGuidance ? (
					<div className="guidance-card">
						<h2>{guidance.title}</h2>
						<p>{guidance.body}</p>
						<div className="guidance-card__debug">
							<div>{engine.depthDebug.label} / {engine.depthDebug.detail}</div>
							<div>{engine.coarseLocationDebugText}</div>
						</div>
					</div>
				) : null}

				{showCaptureOverlay ? null : showTargetGuidance ? (
					<div className={ `target-guidance-card target-guidance-card--${engine.targetGuidance.alignment}` }>
						<div className="target-guidance-card__eyebrow">当前未看到模型</div>
						<div className="target-guidance-card__direction">{engine.targetGuidance.directionText}</div>
						<div className="target-guidance-card__distance">{engine.targetGuidance.distanceText}</div>
						<p>{engine.targetGuidance.detailText}</p>
						<div className="target-guidance-card__debug">
							<div>{engine.depthDebug.label} / {engine.depthDebug.detail}</div>
							<div>{engine.coarseLocationDebugText}</div>
						</div>
					</div>
				) : null}

				{showManualAdjustmentOverlay ? <ManualAdjustmentOverlay state={state} actions={actions} /> : null}

				{showCaptureOverlay ? null : showPlacementUi ? (
					<div className="primary-bar">
						<ActionButton label="退出 AR" onClick={actions.exitAr} kind="secondary" />
						<ActionButton
							label={placeActionLabel}
							onClick={ () => void actions.placeModel() }
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

				{showMeasurementCaptureOverlay ? (
					<div className="precision-capture-bar">
						<div className="precision-capture-bar__content">
							<strong>当前模式：{engine.measurement.activeLabel}</strong>
							<span>测点进度：{engine.measurement.capturedPointLabels.length} / {engine.measurement.requiredPointCount}</span>
							<span>采样质量：{engine.measurement.targetQualityText}</span>
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
						))}
					</nav>
				)}
			</div>
		</div>
	);

}
