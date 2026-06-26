import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ArCanvas } from './ArCanvas.js';
import { ModelSelector } from '../components/ModelSelector.js';
import { DisplayModeSelector } from '../components/DisplayModeSelector.js';
import { LayerSelector } from '../components/LayerSelector.js';
import { StageSelector } from '../components/StageSelector.js';
import { ActionButton } from '../components/ActionButton.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { getDisplayModeLabel, getSupportLabel } from '../store/selectors.js';

export function PreArView(props: {
	state: AppState;
	actions: AppActions;
	canvasRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, actions, canvasRef } = props;
	const engine = state.engine;
	const currentModelName = engine.availableModels.find( ( item ) => item.id === engine.selectedModelId )?.name ?? '-';
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';

	return (
		<div className="mobile-pre-ar">
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
					<StatusBadge label={getSupportLabel( engine.arSupportState )} tone={engine.arSupportState} />
				</div>
				<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--preview" />
				<p className="support-copy">{engine.arSupportMessage}</p>
			</div>

			<div className="page-card">
				<div className="field-grid">
					<ModelSelector
						models={engine.availableModels}
						selectedModelId={engine.selectedModelId}
						onChange={actions.selectModel}
					/>
					<DisplayModeSelector value={engine.displayMode} onChange={actions.setDisplayMode} label="默认显示模式" />
				</div>

				<StageSelector
					stages={engine.timelineStages}
					currentIndex={engine.currentTimelineStageIndex}
					onSelect={actions.setTimelineStage}
				/>
				<LayerSelector layers={engine.layerNames} />

				<ActionButton
					label="进入 AR"
					onClick={actions.enterAr}
					kind="primary"
					disabled={engine.arSupportState !== 'supported'}
					activationBehavior="native-click"
				/>
			</div>
		</div>
	);

}
