import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { SelectField } from '../components/SelectField.js';
import { PanelSection } from '../components/PanelCard.js';

export function RegistrationPanel(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
	const engine = state.engine;
	const ui = state.ui;
	const placed = engine.arSessionPhase === 'placed' || engine.appMode === 'pre-ar';
	const canManualAdjust = placed && engine.precisionRegistration.rmsText !== '--';
	const showExportSnapshotAction = engine.appMode === 'pre-ar';

	function handleClearSavedRegistration(): void {

		if ( window.confirm( '确认清除当前模型的已保存配准结果吗？' ) === false ) {
			return;
		}

		actions.clearSavedRegistration();

	}

	function handleExportRegistrationSnapshot(): void {

		if ( window.confirm( '确认导出当前配准快照 JSON 吗？' ) === false ) {
			return;
		}

		actions.exportRegistrationSnapshot();

	}

	return (
		<div className="panel-stack">
			<PanelSection title="当前状态" subtitle="粗配准、精配准和微调都从这里进入。">
				<div className="summary-grid">
					<div className="summary-card">
						<strong>状态</strong>
						<span>{engine.registrationStatusDetail}</span>
					</div>
					<div className="summary-card">
						<strong>RMS</strong>
						<span>{engine.precisionRegistration.rmsText === '--' ? engine.registrationMetrics.rmsText : engine.precisionRegistration.rmsText}</span>
					</div>
				</div>

				<div className="button-row">
					<ActionButton label="重新放置" onClick={actions.resetPlacement} kind="primary" />
					<ActionButton label="重新粗配准" onClick={ () => void actions.enableCoarseRegistration() } />
					<ActionButton label="刷新定位" onClick={ () => void actions.refreshGeoLocation() } />
				</div>

				<div className="button-row">
					<ActionButton label="手动微调" onClick={ () => actions.setRegistrationView( 'manual' ) } kind={ui.registrationView === 'manual' ? 'primary' : undefined} disabled={!canManualAdjust} />
					<ActionButton label="控制点配准" onClick={ () => actions.setRegistrationView( 'control' ) } kind={ui.registrationView === 'control' ? 'primary' : undefined} disabled={!placed} />
				</div>

				{showExportSnapshotAction ? (
					<div className="button-row button-row--compact">
						<ActionButton label="导出配准快照 JSON" onClick={handleExportRegistrationSnapshot} kind="secondary" />
					</div>
				) : null}

				<div className="button-row">
					<ActionButton label="保存配准" onClick={actions.saveManualRegistration} kind="primary" disabled={!canManualAdjust} />
					<ActionButton label="重置微调" onClick={actions.resetManualRegistration} kind="secondary" disabled={!canManualAdjust} />
					<ActionButton label="清除已保存配准" onClick={handleClearSavedRegistration} kind="secondary" disabled={!placed} />
				</div>
			</PanelSection>

			{ui.registrationView === 'manual' ? (
				<PanelSection title="手动微调" subtitle="控制点精确配准完成后，再做最后的人为收口。">
					<div className="manual-grid">
						<ActionButton label="前移" onClick={ () => actions.adjustTranslation( 'z', -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="左移" onClick={ () => actions.adjustTranslation( 'x', -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="上移" onClick={ () => actions.adjustTranslation( 'y', 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="右移" onClick={ () => actions.adjustTranslation( 'x', 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="后移" onClick={ () => actions.adjustTranslation( 'z', 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="下移" onClick={ () => actions.adjustTranslation( 'y', -1 ) } disabled={!canManualAdjust} />
					</div>
					<div className="button-row">
						<ActionButton label="左旋" onClick={ () => actions.adjustYaw( -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="右旋" onClick={ () => actions.adjustYaw( 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="缩小" onClick={ () => actions.adjustScale( -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="放大" onClick={ () => actions.adjustScale( 1 ) } disabled={!canManualAdjust} />
					</div>
					<p className="note-block">
						位置: {engine.manualReadout.positionText}<br />
						角度: {engine.manualReadout.yawText}<br />
						尺度: {engine.manualReadout.scaleText}
					</p>
					{canManualAdjust ? null : (
						<p className="note-block">请先完成控制点精确配准，再进入手动微调阶段。</p>
					)}
				</PanelSection>
			) : null}

			{ui.registrationView === 'control' ? (
				<PanelSection title="控制点配准" subtitle="先选择模型控制点，再确认现场控制点。">
					<SelectField
						label="模型控制点"
						value={engine.precisionRegistration.selectedSourcePoint}
						onChange={actions.selectPrecisionSourcePoint}
						options={[
							{ value: '', label: '请选择模型控制点' },
							...engine.precisionRegistration.availableSourcePoints.map( ( point ) => ( {
								value: point,
								label: point
							} ) )
						]}
					/>
					<div className="button-row">
						<ActionButton label="选择模型点" onClick={actions.armPrecisionSourcePoint} />
						<ActionButton label="确认现场点" onClick={actions.confirmPrecisionTargetPoint} />
					</div>
					<p className="note-block">
						模型点: {engine.precisionRegistration.stagedSourcePoint}<br />
						现场点: {engine.precisionRegistration.stagedTargetPoint}<br />
						采样质量: {engine.precisionRegistration.targetQualityText}<br />
						点对: {engine.precisionRegistration.pairSummaries.length} / 建议至少 4 组<br />
						RMS: {engine.precisionRegistration.rmsText}
					</p>
					<div className="button-row">
						<ActionButton label="加入点对" onClick={actions.addPrecisionPair} kind="secondary" />
						<ActionButton label="计算配准" onClick={actions.solvePrecisionRegistration} kind="primary" />
						<ActionButton label="保存结果" onClick={actions.savePrecisionRegistration} />
						<ActionButton label="清空" onClick={actions.clearPrecisionPairs} />
					</div>
					<div className="list-block">
						{engine.precisionRegistration.pairSummaries.length === 0 ? (
							<div className="list-item">还没有采集控制点对。</div>
						) : engine.precisionRegistration.pairSummaries.map( ( item, index ) => (
							<div key={item} className="list-item">
								<div>{item}</div>
								<div>{engine.precisionRegistration.pairResidualSummaries[ index ] ?? '待求解'}</div>
								<ActionButton
									label="删除"
									onClick={ () => actions.removePrecisionPair( index ) }
									kind="secondary"
								/>
							</div>
						) )}
					</div>
				</PanelSection>
			) : null}
		</div>
	);

}
