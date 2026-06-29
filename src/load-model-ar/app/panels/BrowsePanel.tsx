import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { DisplayModeSelector } from '../components/DisplayModeSelector.js';
import { ModelSelector } from '../components/ModelSelector.js';
import { SegmentedField } from '../components/SegmentedField.js';
import { StageSelector } from '../components/StageSelector.js';
import { PanelSection } from '../components/PanelCard.js';
import {
	SECTION_CUT_PLANE_MODE_OPTIONS,
	getDisplayModeSliderValueText,
	getSectionCutPlaneModeLabel
} from '../../shared/display-modes.js';
import type { SectionCutPlaneMode } from '../../registration/registration-store.js';

export function BrowsePanel(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
	const engine = state.engine;
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';

	return (
		<div className="panel-stack">
			<PanelSection title="AR 透视显示模式" subtitle="五种显示模式共用同一套 AR 放置与配准结果，只切换可视化方式。">
				<DisplayModeSelector value={engine.displayMode} onChange={actions.setDisplayMode} label="模式" />
			</PanelSection>

			{engine.displayMode === 'spatial-reveal' ? (
				<PanelSection
					title="空间显现"
					subtitle="从模型起点逐段显现到当前进度，100% 时恢复完整显示。"
				>
					<div className="summary-grid">
						<div className="summary-card">
							<strong>显现进度</strong>
							<span>{getDisplayModeSliderValueText( 'spatial-reveal', engine.spatialRevealValue )}</span>
						</div>
						<div className="summary-card">
							<strong>当前语义</strong>
							<span>显示从起点到当前进度的模型范围</span>
						</div>
					</div>
				</PanelSection>
			) : null}

			{engine.displayMode === 'section-cut' ? (
				<PanelSection
					title="剖切查看"
					subtitle="移动剖切面查看内部断面；100% 表示剖切面到达远端边界，不是显现完成。"
				>
					<div className="summary-grid">
						<div className="summary-card">
							<strong>剖切位置</strong>
							<span>{getDisplayModeSliderValueText( 'section-cut', engine.sectionCutValue )}</span>
						</div>
						<div className="summary-card">
							<strong>剖切方向</strong>
							<span>{getSectionCutPlaneModeLabel( engine.sectionCutPlaneMode )}</span>
						</div>
					</div>
					<SegmentedField
						label="剖切方向"
						value={engine.sectionCutPlaneMode}
						onChange={ ( value ) => actions.setSectionCutPlaneMode( value as SectionCutPlaneMode ) }
						options={SECTION_CUT_PLANE_MODE_OPTIONS}
					/>
				</PanelSection>
			) : null}

			<PanelSection title="模型与阶段">
				<div className="field-grid">
					<ModelSelector
						label="模型"
						models={engine.availableModels}
						selectedModelId={engine.selectedModelId}
						onChange={actions.selectModel}
					/>
					<div className="field">
						<span>当前阶段</span>
						<div className="value-chip">{currentStage}</div>
					</div>
				</div>
				<StageSelector
					stages={engine.timelineStages}
					currentIndex={engine.currentTimelineStageIndex}
					onSelect={actions.setTimelineStage}
				/>

				<div className="button-row button-row--triple">
					<ActionButton label="上一阶段" onClick={actions.timelinePrev} />
					<ActionButton label="播放" onClick={actions.timelinePlay} kind="primary" />
					<ActionButton label="下一阶段" onClick={actions.timelineNext} />
				</div>
			</PanelSection>
		</div>
	);

}
