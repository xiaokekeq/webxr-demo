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
	const canManualAdjust = placed;
	const showExportSnapshotAction = engine.appMode === 'pre-ar';
	const showInlineManualPanel = ui.registrationView === 'manual' && engine.appMode !== 'ar-session';

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
			<PanelSection title="当前状态" subtitle="先做粗配准，再通过手动微调收口。">
				<div className="summary-grid">
					<div className="summary-card">
						<strong>状态</strong>
						<span>{engine.registrationStatusDetail}</span>
					</div>
					<div className="summary-card">
						<strong>工程 RMS</strong>
						<span>{engine.registrationMetrics.rmsText}</span>
					</div>
				</div>

				<SelectField
					label="近距离预览放置"
					value={engine.autoPreviewPlacementEnabled ? 'enabled' : 'disabled'}
					onChange={ ( value ) => actions.setAutoPreviewPlacementEnabled( value === 'enabled' ) }
					options={[
						{ value: 'disabled', label: '关闭: 按真实目标位置放置' },
						{ value: 'enabled', label: '开启: 优先放到手机前方预览' }
					]}
				/>

				<div className="button-row">
					<ActionButton label="重新放置" onClick={actions.resetPlacement} kind="primary" />
					<ActionButton label="重新粗配准" onClick={ () => void actions.enableCoarseRegistration() } />
					<ActionButton label="刷新定位" onClick={ () => void actions.refreshGeoLocation() } />
				</div>

				<div className="button-row">
					<ActionButton
						label="手动微调"
						onClick={ () => actions.setRegistrationView( 'manual' ) }
						kind={ui.registrationView === 'manual' ? 'primary' : undefined}
						disabled={!canManualAdjust}
					/>
				</div>

				{showExportSnapshotAction ? (
					<div className="button-row button-row--compact">
						<ActionButton label="导出配准快照 JSON" onClick={handleExportRegistrationSnapshot} kind="secondary" />
					</div>
				) : null}

				<div className="button-row">
					<ActionButton label="保存微调" onClick={actions.saveManualRegistration} kind="primary" disabled={!canManualAdjust} />
					<ActionButton label="重置微调" onClick={actions.resetManualRegistration} kind="secondary" disabled={!canManualAdjust} />
					<ActionButton label="清除已保存配准" onClick={handleClearSavedRegistration} kind="secondary" disabled={!placed} />
				</div>
			</PanelSection>

			{showInlineManualPanel ? (
				<PanelSection title="手动微调" subtitle="模型放置完成后，就可以直接微调位置、角度和尺度。">
					<SelectField
						label="微调强度"
						value={engine.manualAdjustmentPreset}
						onChange={ ( value ) => actions.setManualAdjustmentPreset( value as 'fine' | 'medium' | 'coarse' ) }
						options={[
							{ value: 'fine', label: '细调: 0.02m / 1deg / 1.01x' },
							{ value: 'medium', label: '中调: 0.10m / 5deg / 1.05x' },
							{ value: 'coarse', label: '粗调: 0.30m / 15deg / 1.10x' }
						]}
					/>
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
					{canManualAdjust ? (
						<p className="note-block">建议先用“粗调”把模型拉到位，再切到“细调”慢慢收口。</p>
					) : (
						<p className="note-block">请先完成模型放置，再进入手动微调。</p>
					)}
				</PanelSection>
			) : null}
		</div>
	);

}
