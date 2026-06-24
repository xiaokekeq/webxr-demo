import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { SelectField } from '../components/SelectField.js';
import { PanelSection } from '../components/PanelCard.js';

export function InspectionPanel(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
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
					<ActionButton label="编辑记录" onClick={ () => actions.setInspectionFormExpanded( true ) } kind="primary" />
					<ActionButton label="收起表单" onClick={ () => actions.setInspectionFormExpanded( false ) } kind="secondary" />
				</div>
			</PanelSection>

			{state.ui.inspectionFormExpanded ? (
				<PanelSection title="核查记录">
					<div className="field-grid">
						<SelectField
							label="核查状态"
							value={draft.result}
							onChange={ ( value ) => actions.updateInspectionDraft( { result: value } ) }
							options={[
								{ value: '正常', label: '正常' },
								{ value: '异常', label: '异常' },
								{ value: '待复核', label: '待复核' }
							]}
						/>
						<SelectField
							label="问题类型"
							value={draft.type}
							onChange={ ( value ) => actions.updateInspectionDraft( { type: value } ) }
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
							onChange={ ( value ) => actions.updateInspectionDraft( { severity: value } ) }
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
							onChange={ ( event ) => actions.updateInspectionDraft( { note: event.target.value } ) }
							placeholder="请输入问题描述、核查结论或现场情况。"
						/>
					</label>

					<div className="button-row">
						<ActionButton label="拍照" onClick={actions.takeSnapshot} />
						<ActionButton label="保存记录" onClick={actions.saveInspectionRecord} kind="primary" />
						<ActionButton label="导出记录" onClick={actions.exportInspectionRecords} kind="secondary" />
					</div>
				</PanelSection>
			) : null}
		</div>
	);

}
