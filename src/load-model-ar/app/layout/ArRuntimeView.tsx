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
	const subtitle = `${getWorkspaceLabel( engine.workspaceMode )} / ${getPhaseLabel( engine.arSessionPhase )} / ${displayModeLabel} / RMS ${engine.precisionRegistration.rmsText === '--' ? engine.registrationMetrics.rmsText : engine.precisionRegistration.rmsText}`;
	const showPrecisionCaptureOverlay = state.ui.precisionCaptureActive
		&& state.ui.registrationView === 'control'
		&& engine.workspaceMode === 'registration';
	const showMeasurementCaptureOverlay = state.ui.measurementCaptureActive
		&& engine.workspaceMode === 'tools';
	const precisionCaptureActionLabel = engine.precisionRegistration.hasConfirmedTarget ? '加入点对' : '确认现场点';
	const handlePrecisionCaptureAction = engine.precisionRegistration.hasConfirmedTarget
		? actions.addPrecisionPair
		: actions.confirmPrecisionTargetPoint;
	const measurementCaptureActionLabel = `记录第 ${engine.measurement.capturedPointLabels.length + 1} 点`;
	const showCaptureOverlay = showPrecisionCaptureOverlay || showMeasurementCaptureOverlay;
	const showTargetGuidance = engine.arSessionPhase === 'placed' && engine.targetGuidance.visible;

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

				{showCaptureOverlay ? null : showPlacementUi && showGuidance ? (
					<div className="guidance-card">
						<h2>{guidance.title}</h2>
						<p>{guidance.body}</p>
					</div>
				) : null}

				{showCaptureOverlay ? null : showTargetGuidance ? (
					<div className={ `target-guidance-card target-guidance-card--${engine.targetGuidance.alignment}` }>
						<div className="target-guidance-card__eyebrow">当前未看到模型</div>
						<div className="target-guidance-card__direction">{engine.targetGuidance.directionText}</div>
						<div className="target-guidance-card__distance">{engine.targetGuidance.distanceText}</div>
						<p>{engine.targetGuidance.detailText}</p>
					</div>
				) : null}

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

				{showCaptureOverlay ? null : (
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

				{showPrecisionCaptureOverlay ? (
					<div className="precision-capture-bar">
						<div className="precision-capture-bar__content">
							<strong>当前模型点：{engine.precisionRegistration.stagedSourcePoint}</strong>
							<span>现场点：{engine.precisionRegistration.stagedTargetPoint}</span>
							<span>采样质量：{engine.precisionRegistration.targetQualityText}</span>
							<span>{engine.precisionRegistration.workflowStatusText}</span>
						</div>
						<div className="precision-capture-bar__actions">
							<ActionButton
								label="取消采点"
								onClick={actions.cancelPrecisionCapture}
								kind="secondary"
							/>
							<ActionButton
								label={precisionCaptureActionLabel}
								onClick={handlePrecisionCaptureAction}
								kind="primary"
							/>
						</div>
					</div>
				) : showMeasurementCaptureOverlay ? (
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
