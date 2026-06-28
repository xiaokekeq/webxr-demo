import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ArCanvas } from './ArCanvas.js';
import { ModelSelector } from '../components/ModelSelector.js';
import { StageSelector } from '../components/StageSelector.js';
import { ActionButton } from '../components/ActionButton.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { getSupportLabel } from '../store/selectors.js';

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
			<section className="page-card page-card--hero">
				<div className="page-card__eyebrow">{'WebXR \u73b0\u573a\u6838\u67e5'}</div>
				<h1>{'\u5824\u9632\u73b0\u573a\u8f85\u52a9\u6838\u67e5'}</h1>
				<p className="page-card__copy">
					{'\u5148\u9009\u62e9\u6a21\u578b\u548c\u5f53\u524d\u751f\u547d\u5468\u671f\u9636\u6bb5\uff0c\u518d\u8fdb\u5165 AR \u8fdb\u884c\u73b0\u573a\u5bf9\u7167\u3002'}
				</p>
				<div className="chip-list">
					<span className="chip">{currentModelName}</span>
					<span className="chip">{currentStage}</span>
				</div>
			</section>

			<section className="page-card">
				<div className="preview-header">
					<div>
						<h2>{'3D \u6a21\u578b\u9884\u89c8'}</h2>
						<p>{engine.desktopPreviewBadge}</p>
					</div>
					<StatusBadge label={getSupportLabel( engine.arSupportState )} tone={engine.arSupportState} />
				</div>
				<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--preview" />
				<p className="support-copy">{engine.arSupportMessage}</p>
			</section>

			<section className="page-card">
				<div className="field-grid field-grid--single">
					<ModelSelector
						label={'\u6a21\u578b\u9009\u62e9'}
						models={engine.availableModels}
						selectedModelId={engine.selectedModelId}
						onChange={actions.selectModel}
					/>
				</div>

				<div className="page-section-label">{'\u751f\u547d\u5468\u671f\u9636\u6bb5'}</div>
				<StageSelector
					stages={engine.timelineStages}
					currentIndex={engine.currentTimelineStageIndex}
					onSelect={actions.setTimelineStage}
				/>

				<div className="button-row">
					<ActionButton
						label={'\u8fdb\u5165 AR'}
						onClick={actions.enterAr}
						kind="primary"
						disabled={engine.arSupportState !== 'supported'}
						activationBehavior="native-click"
					/>
				</div>
			</section>
		</div>
	);

}
