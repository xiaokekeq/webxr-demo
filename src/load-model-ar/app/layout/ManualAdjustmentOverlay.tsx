import React, { useEffect, useRef, useState } from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { GuardedPressButton } from '../components/GuardedPressButton.js';

const HOLD_REPEAT_INTERVAL_MS = 96;

type JoystickDirection = 'up' | 'right' | 'down' | 'left';

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

function FloatingAction(props: {
	label: string;
	kind?: 'primary';
	onPress(): void;
	disabled?: boolean;
}): React.JSX.Element {

	return (
		<GuardedPressButton
			className={ `manual-overlay__floating-action${props.kind === 'primary' ? ' manual-overlay__floating-action--primary' : ''}` }
			onPress={props.onPress}
			disabled={props.disabled}
		>
			{props.label}
		</GuardedPressButton>
	);

}

function HoldRepeatButton(props: {
	className: string;
	disabled?: boolean;
	onStep(): void;
	children: React.ReactNode;
}): React.JSX.Element {

	const { className, disabled = false, onStep, children } = props;
	const pointerIdRef = useRef<number | null>( null );
	const intervalIdRef = useRef<number | null>( null );
	const [ active, setActive ] = useState( false );

	function stopRepeating(): void {

		pointerIdRef.current = null;
		setActive( false );
		if ( intervalIdRef.current !== null ) {
			window.clearInterval( intervalIdRef.current );
			intervalIdRef.current = null;
		}

	}

	useEffect( () => stopRepeating, [] );

	return (
		<button
			className={ `${className}${active ? ' is-active' : ''}` }
			type="button"
			disabled={disabled}
			onPointerDown={ ( event ) => {
				event.stopPropagation();
				event.preventDefault();
				if ( disabled ) {
					return;
				}

				stopRepeating();
				pointerIdRef.current = event.pointerId;
				setActive( true );
				event.currentTarget.setPointerCapture( event.pointerId );
				onStep();
				intervalIdRef.current = window.setInterval( () => {
					onStep();
				}, HOLD_REPEAT_INTERVAL_MS );
			} }
			onPointerUp={ ( event ) => {
				event.stopPropagation();
				event.preventDefault();
				if ( pointerIdRef.current !== event.pointerId ) {
					return;
				}

				stopRepeating();
			} }
			onPointerCancel={ ( event ) => {
				event.stopPropagation();
				if ( pointerIdRef.current !== event.pointerId ) {
					return;
				}

				stopRepeating();
			} }
			onPointerLeave={ () => {
				if ( pointerIdRef.current === null ) {
					return;
				}

				stopRepeating();
			} }
			onContextMenu={ ( event ) => {
				event.preventDefault();
			} }
			onClick={ ( event ) => {
				event.preventDefault();
				event.stopPropagation();
			} }
			onKeyDown={ ( event ) => {
				if ( disabled ) {
					return;
				}

				if ( event.key !== 'Enter' && event.key !== ' ' ) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				onStep();
			} }
		>
			{children}
		</button>
	);

}

function JoystickSegment(props: {
	direction: JoystickDirection;
	icon: string;
	label: string;
	onStep(): void;
	disabled?: boolean;
}): React.JSX.Element {

	return (
		<HoldRepeatButton
			className={ `joystick-pad__segment joystick-pad__segment--${props.direction}` }
			onStep={props.onStep}
			disabled={props.disabled}
		>
			<span className="joystick-pad__icon">{props.icon}</span>
			<span className="joystick-pad__label">{props.label}</span>
		</HoldRepeatButton>
	);

}

function JoystickPad(props: {
	title: string;
	subtitle: string;
	segments: Record<JoystickDirection, {
		icon: string;
		label: string;
		onStep(): void;
		disabled?: boolean;
	}>;
}): React.JSX.Element {

	const { title, subtitle, segments } = props;

	return (
		<div className="joystick-pad">
			<div className="joystick-pad__surface">
				<JoystickSegment direction="up" { ...segments.up } />
				<JoystickSegment direction="right" { ...segments.right } />
				<JoystickSegment direction="down" { ...segments.down } />
				<JoystickSegment direction="left" { ...segments.left } />
				<div className="joystick-pad__center">
					<div className="joystick-pad__knob" />
					<div className="joystick-pad__meta">
						<strong>{title}</strong>
						<span>{subtitle}</span>
					</div>
				</div>
			</div>
		</div>
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
			<div className="manual-overlay__mode-badge">微调模式</div>

			<div className="manual-overlay__topbar">
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

				<div className="manual-overlay__action-stack">
					<FloatingAction label="退出微调" onPress={ () => actions.setRegistrationView( 'overview' ) } />
					<FloatingAction label="保存" kind="primary" onPress={actions.saveManualRegistration} disabled={!canManualAdjust} />
					<FloatingAction label="重置" onPress={actions.resetManualRegistration} disabled={!canManualAdjust} />
				</div>
			</div>

			<div className="manual-overlay__readout">
				<div>{engine.manualReadout.positionText}</div>
				<div>{engine.manualReadout.yawText} / {engine.manualReadout.scaleText}</div>
			</div>

			<div className="manual-overlay__scale-stack">
				<FloatingAction label="缩小" onPress={ () => actions.adjustScale( -1 ) } disabled={!canManualAdjust} />
				<FloatingAction label="放大" onPress={ () => actions.adjustScale( 1 ) } disabled={!canManualAdjust} />
			</div>

			<div className="manual-overlay__pads">
				<JoystickPad
					title="平移"
					subtitle="前后左右"
					segments={{
						up: {
							icon: '↑',
							label: '前移',
							onStep: () => actions.adjustTranslation( 'z', -1 ),
							disabled: !canManualAdjust
						},
						right: {
							icon: '→',
							label: '右移',
							onStep: () => actions.adjustTranslation( 'x', 1 ),
							disabled: !canManualAdjust
						},
						down: {
							icon: '↓',
							label: '后移',
							onStep: () => actions.adjustTranslation( 'z', 1 ),
							disabled: !canManualAdjust
						},
						left: {
							icon: '←',
							label: '左移',
							onStep: () => actions.adjustTranslation( 'x', -1 ),
							disabled: !canManualAdjust
						}
					}}
				/>

				<JoystickPad
					title="姿态"
					subtitle="升降 / 旋转"
					segments={{
						up: {
							icon: '↑',
							label: '上移',
							onStep: () => actions.adjustTranslation( 'y', 1 ),
							disabled: !canManualAdjust
						},
						right: {
							icon: '↻',
							label: '右旋',
							onStep: () => actions.adjustYaw( 1 ),
							disabled: !canManualAdjust
						},
						down: {
							icon: '↓',
							label: '下移',
							onStep: () => actions.adjustTranslation( 'y', -1 ),
							disabled: !canManualAdjust
						},
						left: {
							icon: '↺',
							label: '左旋',
							onStep: () => actions.adjustYaw( -1 ),
							disabled: !canManualAdjust
						}
					}}
				/>
			</div>
		</div>
	);

}
