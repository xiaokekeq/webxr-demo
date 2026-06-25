import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { PanelSection } from '../components/PanelCard.js';

export function ToolsPanel(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
	const engine = state.engine;
	const measurement = engine.measurement;
	const canMeasure = engine.appMode === 'ar-session' && engine.arSessionPhase === 'placed';
	const nextPointIndex = measurement.capturedPointLabels.length + 1;

	return (
		<div className="panel-stack">
			<PanelSection
				title="现场测量"
				subtitle="使用 hit-test 采样现场点，支持两点测距、水平距离和深入测量。"
			>
				<div className="summary-grid">
					<div className="summary-card">
						<strong>当前模式</strong>
						<span>{measurement.activeLabel}</span>
						<span>采点进度: {measurement.capturedPointLabels.length} / {measurement.requiredPointCount}</span>
					</div>
					<div className="summary-card">
						<strong>当前结果</strong>
						<span>{measurement.resultText}</span>
						<span>{measurement.targetQualityText}</span>
					</div>
				</div>

				<div className="button-row">
					<ActionButton
						label="两点测距"
						onClick={ () => actions.startMeasurementMode( 'distance-3d' ) }
						kind={measurement.activeMode === 'distance-3d' ? 'primary' : undefined}
						disabled={!canMeasure}
					/>
					<ActionButton
						label="水平距离"
						onClick={ () => actions.startMeasurementMode( 'distance-horizontal' ) }
						kind={measurement.activeMode === 'distance-horizontal' ? 'primary' : undefined}
						disabled={!canMeasure}
					/>
					<ActionButton
						label="深入测量"
						onClick={ () => actions.startMeasurementMode( 'depth' ) }
						kind={measurement.activeMode === 'depth' ? 'primary' : undefined}
						disabled={!canMeasure}
					/>
				</div>

				<div className="button-row">
					<ActionButton
						label={measurement.isCapturing ? `记录第 ${nextPointIndex} 点` : '继续测量'}
						onClick={actions.confirmMeasurementPoint}
						kind="primary"
						disabled={!measurement.isCapturing}
					/>
					<ActionButton
						label="取消当前测量"
						onClick={actions.cancelMeasurement}
						kind="secondary"
						disabled={measurement.activeMode === null}
					/>
					<ActionButton
						label="清除测量"
						onClick={actions.clearMeasurement}
						kind="secondary"
					/>
				</div>

				{measurement.feedbackText ? (
					<div className={ `alert-block alert-block--${measurement.feedbackTone}` }>
						<strong>{measurement.feedbackTone === 'error' ? '当前阻塞' : measurement.feedbackTone === 'success' ? '测量结果' : '流程提示'}</strong>
						<span>{measurement.feedbackText}</span>
						{measurement.feedbackUpdatedAt ? (
							<span className="alert-block__meta">更新时间: {measurement.feedbackUpdatedAt}</span>
						) : null}
					</div>
				) : null}

				<div className="detail-grid">
					<div>
						<strong>结果说明</strong>
						<span>{measurement.detailText}</span>
					</div>
					<div>
						<strong>使用条件</strong>
						<span>{canMeasure ? '模型已放置，可以开始采点。' : '请先进入 AR 并完成模型放置。'}</span>
					</div>
				</div>

				<div className="list-block">
					{measurement.capturedPointLabels.length === 0 ? (
						<div className="list-item">还没有记录测点。</div>
					) : measurement.capturedPointLabels.map( ( point, index ) => (
						<div key={point} className="list-item">
							<div>测点 {index + 1}</div>
							<div>{point}</div>
						</div>
					) )}
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
