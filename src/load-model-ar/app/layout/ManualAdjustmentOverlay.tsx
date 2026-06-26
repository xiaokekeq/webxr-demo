import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { GuardedPressButton } from '../components/GuardedPressButton.js';

function PresetChip(props: {
	label: string;
	active?: boolean;
	onPress(): void;
}): React.JSX.Element {

	return (
		<GuardedPressButton
			className={ `manual-overlay__preset${props.active ? ' is-active' : ''}` }
			onPress={props.onPress}
		>
			{props.label}
		</GuardedPressButton>
	);

}

function DirectionButton(props: {
	label: string;
	axis: string;
	onPress(): void;
	disabled?: boolean;
	accent?: 'vertical';
}): React.JSX.Element {

	return (
		<GuardedPressButton
			className={ `manual-overlay__direction${props.accent === 'vertical' ? ' manual-overlay__direction--vertical' : ''}` }
			onPress={props.onPress}
			disabled={props.disabled}
		>
			<span className="manual-overlay__direction-label">{props.label}</span>
			<span className="manual-overlay__direction-axis">{props.axis}</span>
		</GuardedPressButton>
	);

}

export function ManualAdjustmentOverlay(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
	const engine = state.engine;
	const canManualAdjust = engine.arSessionPhase === 'placed' || engine.appMode === 'pre-ar';

	return (
		<div className="manual-overlay-shell">
			<div className="manual-overlay">
				<div className="manual-overlay__header">
					<div>
						<strong>手动微调</strong>
						<p>直接在 AR 画面里做六向微调，不再让底部面板挡住视野。</p>
					</div>
					<ActionButton label="返回面板" onClick={ () => actions.setRegistrationView( 'overview' ) } kind="secondary" />
				</div>

				<div className="manual-overlay__presets">
					<PresetChip
						label="细调"
						active={engine.manualAdjustmentPreset === 'fine'}
						onPress={ () => actions.setManualAdjustmentPreset( 'fine' ) }
					/>
					<PresetChip
						label="中调"
						active={engine.manualAdjustmentPreset === 'medium'}
						onPress={ () => actions.setManualAdjustmentPreset( 'medium' ) }
					/>
					<PresetChip
						label="粗调"
						active={engine.manualAdjustmentPreset === 'coarse'}
						onPress={ () => actions.setManualAdjustmentPreset( 'coarse' ) }
					/>
				</div>

				<div className="manual-overlay__control-grid">
					<div className="manual-overlay__pad">
						<div className="manual-overlay__pad-spacer" />
						<DirectionButton
							label="前移"
							axis="Z-"
							onPress={ () => actions.adjustTranslation( 'z', -1 ) }
							disabled={!canManualAdjust}
						/>
						<div className="manual-overlay__pad-spacer" />
						<DirectionButton
							label="左移"
							axis="X-"
							onPress={ () => actions.adjustTranslation( 'x', -1 ) }
							disabled={!canManualAdjust}
						/>
						<div className="manual-overlay__pad-center">
							<span>平移</span>
							<small>X / Z</small>
						</div>
						<DirectionButton
							label="右移"
							axis="X+"
							onPress={ () => actions.adjustTranslation( 'x', 1 ) }
							disabled={!canManualAdjust}
						/>
						<div className="manual-overlay__pad-spacer" />
						<DirectionButton
							label="后移"
							axis="Z+"
							onPress={ () => actions.adjustTranslation( 'z', 1 ) }
							disabled={!canManualAdjust}
						/>
						<div className="manual-overlay__pad-spacer" />
					</div>

					<div className="manual-overlay__vertical">
						<DirectionButton
							label="上移"
							axis="Y+"
							accent="vertical"
							onPress={ () => actions.adjustTranslation( 'y', 1 ) }
							disabled={!canManualAdjust}
						/>
						<DirectionButton
							label="下移"
							axis="Y-"
							accent="vertical"
							onPress={ () => actions.adjustTranslation( 'y', -1 ) }
							disabled={!canManualAdjust}
						/>
					</div>
				</div>

				<div className="manual-overlay__adjustments">
					<ActionButton label="左旋" onClick={ () => actions.adjustYaw( -1 ) } disabled={!canManualAdjust} />
					<ActionButton label="右旋" onClick={ () => actions.adjustYaw( 1 ) } disabled={!canManualAdjust} />
					<ActionButton label="缩小" onClick={ () => actions.adjustScale( -1 ) } disabled={!canManualAdjust} />
					<ActionButton label="放大" onClick={ () => actions.adjustScale( 1 ) } disabled={!canManualAdjust} />
				</div>

				<p className="manual-overlay__readout">
					位置: {engine.manualReadout.positionText}<br />
					角度: {engine.manualReadout.yawText}<br />
					尺度: {engine.manualReadout.scaleText}
				</p>

				<div className="manual-overlay__actions">
					<ActionButton label="保存微调" onClick={actions.saveManualRegistration} kind="primary" disabled={!canManualAdjust} />
					<ActionButton label="重置微调" onClick={actions.resetManualRegistration} disabled={!canManualAdjust} />
				</div>
			</div>
		</div>
	);

}
