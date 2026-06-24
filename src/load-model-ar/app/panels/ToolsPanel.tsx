import type React from 'react';
import type { AppActions } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { PanelSection } from '../components/PanelCard.js';

export function ToolsPanel(props: {
	actions: AppActions;
}): React.JSX.Element {

	const { actions } = props;

	return (
		<div className="panel-stack">
			<PanelSection title="测量" subtitle="先打通工具入口，后续再接真实测量逻辑。">
				<div className="button-row">
					<ActionButton label="两点测距" onClick={ () => actions.runMeasurementTool( '两点测距' ) } />
					<ActionButton label="高差测量" onClick={ () => actions.runMeasurementTool( '高差测量' ) } />
					<ActionButton label="模型偏差" onClick={ () => actions.runMeasurementTool( '模型偏差测量' ) } kind="secondary" />
					<ActionButton label="清除测量" onClick={ () => actions.runMeasurementTool( '清除测量' ) } kind="secondary" />
				</div>
			</PanelSection>

			<PanelSection title="截图">
				<div className="button-row">
					<ActionButton label="当前画面" onClick={actions.takeSnapshot} />
					<ActionButton label="带模型信息" onClick={actions.takeSnapshot} kind="secondary" />
				</div>
			</PanelSection>

			<PanelSection title="标注与辅助">
				<div className="button-row">
					<ActionButton label="添加标注" onClick={ () => actions.toggleAnnotationHelper( '添加标注' ) } />
					<ActionButton label="显示控制点" onClick={ () => actions.toggleAnnotationHelper( '显示控制点' ) } kind="secondary" />
				</div>
			</PanelSection>
		</div>
	);

}
