import React, { useEffect, useRef, useState } from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { GuardedPressButton } from '../components/GuardedPressButton.js';

const HOLD_REPEAT_INTERVAL_MS = 88;
const JOYSTICK_RADIUS_PX = 44;
const JOYSTICK_DEADZONE_PX = 10;

type JoystickDirection = 'up' | 'right' | 'down' | 'left';
type ManualPreset = 'fine' | 'medium' | 'coarse';

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

function getDirectionFromOffset(x: number, y: number): JoystickDirection | null {

	const length = Math.hypot( x, y );
	if ( length < JOYSTICK_DEADZONE_PX ) {
		return null;
	}

	if ( Math.abs( x ) > Math.abs( y ) ) {
		return x > 0 ? 'right' : 'left';
	}

	return y > 0 ? 'down' : 'up';

}

function clampOffset(x: number, y: number): {
	x: number;
	y: number;
} {

	const length = Math.hypot( x, y );
	if ( length <= JOYSTICK_RADIUS_PX || length <= 1e-6 ) {
		return { x, y };
	}

	const scale = JOYSTICK_RADIUS_PX / length;
	return {
		x: x * scale,
		y: y * scale
	};

}

function JoystickPad(props: {
	title: string;
	subtitle: string;
	disabled?: boolean;
	actions: Record<JoystickDirection, () => void>;
}): React.JSX.Element {

	const { title, subtitle, disabled = false, actions } = props;
	const surfaceRef = useRef<HTMLDivElement | null>( null );
	const pointerIdRef = useRef<number | null>( null );
	const repeatIdRef = useRef<number | null>( null );
	const currentDirectionRef = useRef<JoystickDirection | null>( null );
	const [ knobOffset, setKnobOffset ] = useState( { x: 0, y: 0 } );
	const [ activeDirection, setActiveDirection ] = useState<JoystickDirection | null>( null );

	function stopRepeating(): void {

		if ( repeatIdRef.current !== null ) {
			window.clearInterval( repeatIdRef.current );
			repeatIdRef.current = null;
		}

		currentDirectionRef.current = null;
		setActiveDirection( null );
		setKnobOffset( { x: 0, y: 0 } );
		pointerIdRef.current = null;

	}

	function updateDirection(direction: JoystickDirection | null): void {

		if ( repeatIdRef.current !== null ) {
			window.clearInterval( repeatIdRef.current );
			repeatIdRef.current = null;
		}

		currentDirectionRef.current = direction;
		setActiveDirection( direction );

		if ( direction === null ) {
			return;
		}

		actions[ direction ]();
		repeatIdRef.current = window.setInterval( () => {
			actions[ direction ]();
		}, HOLD_REPEAT_INTERVAL_MS );

	}

	function updateFromClientPoint(clientX: number, clientY: number): void {

		const surface = surfaceRef.current;
		if ( surface === null ) {
			return;
		}

		const rect = surface.getBoundingClientRect();
		const localX = clientX - ( rect.left + rect.width / 2 );
		const localY = clientY - ( rect.top + rect.height / 2 );
		const nextOffset = clampOffset( localX, localY );
		const nextDirection = getDirectionFromOffset( nextOffset.x, nextOffset.y );

		setKnobOffset( nextOffset );
		if ( currentDirectionRef.current !== nextDirection ) {
			updateDirection( nextDirection );
		}

	}

	useEffect( () => stopRepeating, [] );

	return (
		<div className="joystick-pad">
			<div
				ref={surfaceRef}
				className={ `joystick-pad__surface${activeDirection !== null ? ' is-active' : ''}` }
				onPointerDown={ ( event ) => {
					event.stopPropagation();
					event.preventDefault();
					if ( disabled ) {
						return;
					}

					stopRepeating();
					pointerIdRef.current = event.pointerId;
					event.currentTarget.setPointerCapture( event.pointerId );
					updateFromClientPoint( event.clientX, event.clientY );
				} }
				onPointerMove={ ( event ) => {
					if ( disabled || pointerIdRef.current !== event.pointerId ) {
						return;
					}

					event.stopPropagation();
					event.preventDefault();
					updateFromClientPoint( event.clientX, event.clientY );
				} }
				onPointerUp={ ( event ) => {
					if ( pointerIdRef.current !== event.pointerId ) {
						return;
					}

					event.stopPropagation();
					event.preventDefault();
					stopRepeating();
				} }
				onPointerCancel={ ( event ) => {
					if ( pointerIdRef.current !== event.pointerId ) {
						return;
					}

					event.stopPropagation();
					stopRepeating();
				} }
				onContextMenu={ ( event ) => {
					event.preventDefault();
				} }
			>
				<div className={ `joystick-pad__hint joystick-pad__hint--up${activeDirection === 'up' ? ' is-active' : ''}` }>↑</div>
				<div className={ `joystick-pad__hint joystick-pad__hint--right${activeDirection === 'right' ? ' is-active' : ''}` }>→</div>
				<div className={ `joystick-pad__hint joystick-pad__hint--down${activeDirection === 'down' ? ' is-active' : ''}` }>↓</div>
				<div className={ `joystick-pad__hint joystick-pad__hint--left${activeDirection === 'left' ? ' is-active' : ''}` }>←</div>
				<div className="joystick-pad__center">
					<div
						className="joystick-pad__knob"
						style={{
							transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`
						}}
					/>
					<div className="joystick-pad__meta">
						<strong>{title}</strong>
						<span>{subtitle}</span>
					</div>
				</div>
			</div>
		</div>
	);

}

const PRESET_LABELS: Record<ManualPreset, string> = {
	fine: '细调',
	medium: '中调',
	coarse: '粗调'
};

export function ManualAdjustmentOverlay(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
	const engine = state.engine;
	const canManualAdjust = engine.arSessionPhase === 'placed' || engine.appMode === 'pre-ar';
	const [ presetMenuOpen, setPresetMenuOpen ] = useState( false );
	const currentPresetLabel = PRESET_LABELS[ engine.manualAdjustmentPreset ];

	function handlePresetSelect(preset: ManualPreset): void {

		actions.setManualAdjustmentPreset( preset );
		setPresetMenuOpen( false );

	}

	return (
		<div className="manual-overlay-shell">
			<div className="manual-overlay__left-rail">
				<div className={ `manual-overlay__preset-drawer${presetMenuOpen ? ' is-open' : ''}` }>
					<GuardedPressButton
						className="manual-overlay__preset-trigger"
						onPress={ () => setPresetMenuOpen( ( current ) => !current ) }
					>
						强度 · {currentPresetLabel}
					</GuardedPressButton>
					{presetMenuOpen ? (
						<div className="manual-overlay__preset-options">
							<GuardedPressButton
								className={ `manual-overlay__preset-option${engine.manualAdjustmentPreset === 'fine' ? ' is-active' : ''}` }
								onPress={ () => handlePresetSelect( 'fine' ) }
							>
								细调
							</GuardedPressButton>
							<GuardedPressButton
								className={ `manual-overlay__preset-option${engine.manualAdjustmentPreset === 'medium' ? ' is-active' : ''}` }
								onPress={ () => handlePresetSelect( 'medium' ) }
							>
								中调
							</GuardedPressButton>
							<GuardedPressButton
								className={ `manual-overlay__preset-option${engine.manualAdjustmentPreset === 'coarse' ? ' is-active' : ''}` }
								onPress={ () => handlePresetSelect( 'coarse' ) }
							>
								粗调
							</GuardedPressButton>
						</div>
					) : null}
				</div>

				<JoystickPad
					title="平移"
					subtitle="前后左右"
					disabled={!canManualAdjust}
					actions={{
						up: () => actions.adjustTranslation( 'z', -1 ),
						right: () => actions.adjustTranslation( 'x', 1 ),
						down: () => actions.adjustTranslation( 'z', 1 ),
						left: () => actions.adjustTranslation( 'x', -1 )
					}}
				/>
			</div>

			<div className="manual-overlay__center-stack">
				<div className="manual-overlay__scale-row">
					<FloatingAction label="缩小" onPress={ () => actions.adjustScale( -1 ) } disabled={!canManualAdjust} />
					<FloatingAction label="放大" onPress={ () => actions.adjustScale( 1 ) } disabled={!canManualAdjust} />
				</div>
				<div className="manual-overlay__readout">
					<div>{engine.manualReadout.positionText}</div>
					<div>{engine.manualReadout.yawText} / {engine.manualReadout.scaleText}</div>
				</div>
			</div>

			<div className="manual-overlay__right-rail">
				<div className="manual-overlay__action-stack">
					<FloatingAction label="退出" onPress={ () => actions.setRegistrationView( 'overview' ) } />
					<FloatingAction label="保存" kind="primary" onPress={actions.saveManualRegistration} disabled={!canManualAdjust} />
					<FloatingAction label="重置" onPress={actions.resetManualRegistration} disabled={!canManualAdjust} />
				</div>

				<JoystickPad
					title="姿态"
					subtitle="升降 / 旋转"
					disabled={!canManualAdjust}
					actions={{
						up: () => actions.adjustTranslation( 'y', 1 ),
						right: () => actions.adjustYaw( 1 ),
						down: () => actions.adjustTranslation( 'y', -1 ),
						left: () => actions.adjustYaw( -1 )
					}}
				/>
			</div>
		</div>
	);

}
