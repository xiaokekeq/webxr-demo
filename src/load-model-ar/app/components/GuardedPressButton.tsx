import React, { useCallback } from 'react';

const GHOST_CLICK_WINDOW_MS = 420;
let suppressGhostClickUntil = 0;

export function GuardedPressButton(props: {
	className: string;
	type?: 'button' | 'submit' | 'reset';
	onPress(): void;
	disabled?: boolean;
	children: React.ReactNode;
}): React.JSX.Element {

	const { className, type = 'button', onPress, disabled = false, children } = props;

	const handlePointerDown = useCallback( ( event: React.PointerEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
	}, [] );

	const handlePointerUp = useCallback( ( event: React.PointerEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
		if ( disabled ) {
			event.preventDefault();
			return;
		}

		suppressGhostClickUntil = performance.now() + GHOST_CLICK_WINDOW_MS;
		event.preventDefault();
		onPress();
	}, [ disabled, onPress ] );

	const handleClick = useCallback( ( event: React.MouseEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
		if ( disabled ) {
			event.preventDefault();
			return;
		}

		if ( performance.now() < suppressGhostClickUntil ) {
			event.preventDefault();
			return;
		}

		onPress();
	}, [ disabled, onPress ] );

	return (
		<button
			className={className}
			type={type}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onClick={handleClick}
			disabled={disabled}
		>
			{children}
		</button>
	);

}
