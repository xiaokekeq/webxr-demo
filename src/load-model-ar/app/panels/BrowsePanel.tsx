import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { DisplayModeSelector } from '../components/DisplayModeSelector.js';
import { LayerSelector } from '../components/LayerSelector.js';
import { ModelSelector } from '../components/ModelSelector.js';
import { StageSelector } from '../components/StageSelector.js';
import { PanelSection } from '../components/PanelCard.js';
import { SelectField } from '../components/SelectField.js';
import { getDisplayModeLabel } from '../store/selectors.js';

export function BrowsePanel(props: {
	state: AppState;
	actions: AppActions;
	canInspect: boolean;
}): React.JSX.Element {

	const { state, actions, canInspect } = props;
	const engine = state.engine;
	const ui = state.ui;
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';

	return (
		<div className="panel-stack">
			<PanelSection title="显示模式" subtitle="在普通叠加、透视核查和遮挡辅助之间切换。">
				<DisplayModeSelector value={engine.displayMode} onChange={actions.setDisplayMode} label="模式" />
				<SelectField
					label="CPU Depth 回退"
					value={engine.cpuDepthFallbackEnabled ? 'enabled' : 'disabled'}
					onChange={ ( value ) => actions.setCpuDepthFallbackEnabled( value === 'enabled' ) }
					options={[
						{ value: 'enabled', label: '开启：GPU 不可用时继续走 CPU depth 测试' },
						{ value: 'disabled', label: '关闭：仅保留 GPU depth，排查定位与性能波动' }
					]}
				/>
				<p className="note-block">
					这个开关只影响 X-Ray / 遮挡辅助的 CPU depth 回退路径，不会改动 GPS、ENU、工程配准和模型放置解算。
				</p>
			</PanelSection>

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

				<LayerSelector layers={engine.layerNames} />
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

			<PanelSection
				title="当前构件"
				subtitle={engine.hasSelection ? '已选中构件，可继续核查。' : '点选模型构件后，这里会显示详情。'}
			>
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
						<div><strong>深度</strong><span>{engine.propertyPanel.depth}</span></div>
					</div>
				) : null}

				<p className="note-block">
					{engine.hasSelection ? engine.propertyPanel.remark : '这里负责显示模式、图层与阶段浏览；选中构件后可以进入核查。'}
				</p>

				<div className="button-row">
					<ActionButton
						label={ui.browseDetailsExpanded ? '收起详情' : '查看详情'}
						onClick={ () => actions.setBrowseDetailsExpanded( !ui.browseDetailsExpanded ) }
						disabled={!engine.hasSelection}
					/>
					<ActionButton
						label="进入核查"
						onClick={ () => actions.activatePanel( 'inspection' ) }
						kind="secondary"
						disabled={!canInspect}
					/>
					{engine.hasSelection ? (
						<ActionButton label="关闭" onClick={actions.closePropertyPanel} kind="secondary" />
					) : null}
				</div>
			</PanelSection>
		</div>
	);

}
