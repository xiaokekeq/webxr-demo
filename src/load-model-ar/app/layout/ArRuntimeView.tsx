import React, { useState } from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import {
	PANEL_OPTIONS,
	getDisplayModeLabel,
	getGuidanceContent,
	getPhaseLabel,
	getWorkspaceLabel
} from '../store/selectors.js';
import { ActionButton } from '../components/ActionButton.js';
import { GuardedPressButton } from '../components/GuardedPressButton.js';
import { BrowsePanel } from '../panels/BrowsePanel.js';
import { InspectionPanel } from '../panels/InspectionPanel.js';
import { RegistrationPanel } from '../panels/RegistrationPanel.js';
import { ArCanvas } from './ArCanvas.js';
import { ArStatusBar } from './ArStatusBar.js';
import { BottomDrawer } from './BottomDrawer.js';
import { ManualAdjustmentOverlay } from './ManualAdjustmentOverlay.js';
import { usePlacementGuidance } from './use-placement-guidance.js';
import {
	getDisplayModeSliderLabel,
	getDisplayModeSliderValueText
} from '../../shared/display-modes.js';

export function ArRuntimeView(props: {
	state: AppState;
	actions: AppActions;
	canvasRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, actions, canvasRef } = props;
	const engine = state.engine;
	const markerCalibrationMode = engine.markerCalibration.active;
	const guidance = getGuidanceContent( engine.arSessionPhase );
	const showPlacementUi = engine.arSessionPhase === 'scanning' || engine.arSessionPhase === 'ready-to-place';
	const showGuidance = usePlacementGuidance( engine.arSessionPhase );
	const canInspect = engine.arSessionPhase === 'placed';
	const canOpenBrowse = engine.arSessionPhase === 'placed' || showPlacementUi;
	const drawerToggleLabel = state.ui.drawerOpen ? '收起面板' : `展开${getWorkspaceLabel( engine.workspaceMode )}`;
	const displayModeLabel = getDisplayModeLabel( engine.displayMode );
	const subtitle = `${getWorkspaceLabel( engine.workspaceMode )} / ${getPhaseLabel( engine.arSessionPhase )} / ${displayModeLabel} / RMS ${engine.registrationMetrics.rmsText}`;
	const showTargetGuidance = engine.arSessionPhase === 'placed' && engine.targetGuidance.visible;
	const showCoarsePlacementDebug = true;
	const showManualAdjustmentOverlay = markerCalibrationMode === false
		&& engine.workspaceMode === 'registration'
		&& state.ui.registrationView === 'manual'
		&& engine.appMode === 'ar-session';
	const showVisualizationSlider = markerCalibrationMode === false
		&& showManualAdjustmentOverlay === false
		&& showPlacementUi === false
		&& showGuidance === false
		&& state.ui.drawerOpen === false
		&& engine.displayMode !== 'solid-overlay';
	const [ targetGuidanceHidden, setTargetGuidanceHidden ] = useState( false );
	const showTargetGuidanceCard = markerCalibrationMode === false
		&& showTargetGuidance
		&& targetGuidanceHidden === false;
	const showTargetGuidanceToggle = markerCalibrationMode === false
		&& showTargetGuidance
		&& targetGuidanceHidden;
	const visualizationSliderLabel = getDisplayModeSliderLabel( engine.displayMode ) ?? '显示强度';
	const visualizationSliderValueText = getDisplayModeSliderValueText(
		engine.displayMode,
		engine.structureRevealValue
	);

	return (
		<div className={ `mobile-ar-root${showPlacementUi ? ' mobile-ar-root--placement' : ''}` }>
			<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--fullscreen" />

			<div
				className="mobile-overlay"
				data-ar-ui="true"
				onPointerDownCapture={actions.handleArUiInteraction}
				onPointerUpCapture={actions.handleArUiInteraction}
			>
				{markerCalibrationMode ? null : (
					<ArStatusBar
						title={engine.projectName}
						subtitle={subtitle}
						status={engine.arSessionPhase === 'ready-to-place' ? '可放置' : getPhaseLabel( engine.arSessionPhase )}
						statusDisabled={true}
					/>
				)}

				{markerCalibrationMode === false && showPlacementUi && showGuidance ? (
					<div className="guidance-card">
						<h2>{guidance.title}</h2>
						<p>{guidance.body}</p>
						{showCoarsePlacementDebug ? (
							<div className="guidance-card__debug">{engine.coarseLocationDebugText}</div>
						) : null}
					</div>
				) : null}

				{showTargetGuidanceCard ? (
					<div className={ `target-guidance-card target-guidance-card--${engine.targetGuidance.alignment}` }>
						<div className="target-guidance-card__header">
							<div className="target-guidance-card__summary">
								<div className="target-guidance-card__eyebrow">当前暂未看到模型</div>
								<div className="target-guidance-card__direction">{engine.targetGuidance.directionText}</div>
								<div className="target-guidance-card__distance">{engine.targetGuidance.distanceText}</div>
							</div>
							<button
								type="button"
								className="target-guidance-card__toggle"
								onClick={ () => {
									setTargetGuidanceHidden( true );
								} }
							>
								隐藏提示
							</button>
						</div>
						<p>{engine.targetGuidance.detailText}</p>
						{showCoarsePlacementDebug ? (
							<div className="target-guidance-card__debug">{engine.coarseLocationDebugText}</div>
						) : null}
					</div>
				) : null}

				{showTargetGuidanceToggle ? (
					<button
						type="button"
						className={ `target-guidance-toggle target-guidance-toggle--${engine.targetGuidance.alignment}` }
						onClick={ () => {
							setTargetGuidanceHidden( false );
						} }
					>
						显示提示
					</button>
				) : null}

				{showManualAdjustmentOverlay ? <ManualAdjustmentOverlay state={state} actions={actions} /> : null}

				{markerCalibrationMode ? (
					<div className="precision-capture-bar">
						<div className="precision-capture-bar__content">
							<strong>Marker 校正采集中</strong>
							<span>
								当前会话 {engine.markerCalibration.capturedCornerCount}/{engine.markerCalibration.expectedCornerCount}
								{engine.markerCalibration.capturedCornerCount >= engine.markerCalibration.expectedCornerCount
									? '，4 个角点已采集完成'
									: `，下一点：${engine.markerCalibration.nextCornerLabel}`}
							</span>
							<span>采集时已隐藏面板、退出 AR、放置模型和底部 tab，避免误触。</span>
						</div>
						<div className="precision-capture-bar__actions precision-capture-bar__actions--marker">
							<ActionButton
								label="采集当前角点"
								onClick={actions.captureCurrentSessionMarkerCorner}
								kind="primary"
								disabled={!engine.markerCalibration.canCapture}
							/>
							<ActionButton
								label="求解并应用"
								onClick={actions.solveAndApplyCurrentSessionMarkerCalibration}
								kind="secondary"
								disabled={!engine.markerCalibration.canSolve}
							/>
							<ActionButton
								label="重置并退出"
								onClick={actions.resetCurrentSessionMarkerCalibration}
								kind="secondary"
							/>
						</div>
					</div>
				) : null}

				{markerCalibrationMode === false && showPlacementUi ? (
					<div className="primary-bar">
						<ActionButton label="退出 AR" onClick={actions.exitAr} kind="secondary" />
						<ActionButton
							label="放置模型"
							onClick={() => void actions.placeModel()}
							kind="primary"
							disabled={engine.arSessionPhase !== 'ready-to-place'}
						/>
					</div>
				) : null}

				{markerCalibrationMode || showManualAdjustmentOverlay ? null : (
					<BottomDrawer
						open={state.ui.drawerOpen}
						workspaceMode={engine.workspaceMode}
						onToggle={actions.toggleDrawer}
						toggleLabel={drawerToggleLabel}
					>
						{engine.workspaceMode === 'browse' ? <BrowsePanel state={state} actions={actions} /> : null}
						{engine.workspaceMode === 'registration' ? <RegistrationPanel state={state} actions={actions} /> : null}
						{engine.workspaceMode === 'inspection' ? <InspectionPanel state={state} actions={actions} /> : null}
					</BottomDrawer>
				)}

				{showVisualizationSlider ? (
					<div className="ar-minimal-perspective">
						<input
							className="ar-minimal-perspective__slider"
							type="range"
							min={0}
							max={100}
							step={1}
							aria-label={visualizationSliderLabel}
							aria-valuetext={visualizationSliderValueText}
							title={visualizationSliderValueText}
							value={engine.structureRevealValue}
							onChange={ ( event ) => {
								actions.setStructureRevealValue( Number( event.currentTarget.value ) );
							} }
						/>
					</div>
				) : null}

				{markerCalibrationMode ? null : (
					<nav className="bottom-nav">
						{PANEL_OPTIONS.map( ( item ) => (
							<GuardedPressButton
								key={item.value}
								className={ `nav-button${engine.workspaceMode === item.value ? ' is-active' : ''}` }
								onPress={ () => actions.activatePanel( item.value ) }
								disabled={
									( item.value === 'browse' && !canOpenBrowse )
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
