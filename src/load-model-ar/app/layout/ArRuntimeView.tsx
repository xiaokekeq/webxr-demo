import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { PANEL_OPTIONS, getGuidanceContent, getPhaseLabel, getWorkspaceLabel } from '../store/selectors.js';
import { ArCanvas } from './ArCanvas.js';
import { ArStatusBar } from './ArStatusBar.js';
import { QuickActions } from './QuickActions.js';
import { BottomDrawer } from './BottomDrawer.js';
import { ActionButton } from '../components/ActionButton.js';
import { BrowsePanel } from '../panels/BrowsePanel.js';
import { RegistrationPanel } from '../panels/RegistrationPanel.js';
import { ToolsPanel } from '../panels/ToolsPanel.js';
import { InspectionPanel } from '../panels/InspectionPanel.js';

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
	const canInspect = engine.arSessionPhase === 'placed';
	const subtitle = `${getWorkspaceLabel( engine.workspaceMode )} / ${getPhaseLabel( engine.arSessionPhase )} / RMS ${engine.precisionRegistration.rmsText === '--' ? engine.registrationMetrics.rmsText : engine.precisionRegistration.rmsText}`;

	return (
		<div className="mobile-ar-root">
			<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--fullscreen" />
			<div ref={xrButtonRef} className="xr-button-wrap" />

			<div
				className="mobile-overlay"
				data-ar-ui="true"
				onPointerDownCapture={actions.handleArUiInteraction}
				onPointerUpCapture={actions.handleArUiInteraction}
			>
				<ArStatusBar
					title={engine.projectName}
					subtitle={subtitle}
					status={getPhaseLabel( engine.arSessionPhase )}
				/>

				{showPlacementUi ? (
					<div className="guidance-card">
						<h2>{guidance.title}</h2>
						<p>{guidance.body}</p>
					</div>
				) : null}

				<QuickActions
					onDisplay={actions.cycleDisplayMode}
					onSnapshot={actions.takeSnapshot}
					onDrawer={actions.toggleDrawer}
				/>

				{showPlacementUi ? (
					<div className="primary-bar">
						<ActionButton label="退出 AR" onClick={actions.exitAr} kind="secondary" />
						<ActionButton
							label={engine.arSessionPhase === 'ready-to-place' ? '开始放置' : '等待平面'}
							onClick={ () => void actions.placeModel() }
							kind="primary"
							disabled={engine.arSessionPhase !== 'ready-to-place'}
						/>
					</div>
				) : null}

				<BottomDrawer
					open={state.ui.drawerOpen}
					workspaceMode={engine.workspaceMode}
					onToggle={actions.toggleDrawer}
				>
					{engine.workspaceMode === 'browse' ? <BrowsePanel state={state} actions={actions} canInspect={canInspect} /> : null}
					{engine.workspaceMode === 'registration' ? <RegistrationPanel state={state} actions={actions} /> : null}
					{engine.workspaceMode === 'tools' ? <ToolsPanel actions={actions} /> : null}
					{engine.workspaceMode === 'inspection' ? <InspectionPanel state={state} actions={actions} /> : null}
				</BottomDrawer>

				<nav className="bottom-nav">
					{PANEL_OPTIONS.map( ( item ) => (
						<button
							key={item.value}
							className={ `nav-button${engine.workspaceMode === item.value ? ' is-active' : ''}` }
							type="button"
							onClick={ () => actions.activatePanel( item.value ) }
							disabled={item.value !== 'registration' && !canInspect}
						>
							<span className="nav-button__icon">{item.short}</span>
							<span>{item.label}</span>
						</button>
					))}
				</nav>
			</div>
		</div>
	);

}
