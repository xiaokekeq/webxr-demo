import React, { useCallback, useRef } from 'react';

export function GuardedPressButton(props: {
	className: string;
	type?: 'button' | 'submit' | 'reset';
	onPress(): void;
	disabled?: boolean;
	children: React.ReactNode;
}): React.JSX.Element {

	const { className, type = 'button', onPress, disabled = false, children } = props;
	const activePointerIdRef = useRef<number | null>( null );

	const handlePointerDown = useCallback( ( event: React.PointerEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
		if ( disabled ) {
			return;
		}

		activePointerIdRef.current = event.pointerId;
		event.currentTarget.setPointerCapture( event.pointerId );
	}, [ disabled ] );

	const resetPointerState = useCallback( () => {
		activePointerIdRef.current = null;
	}, [] );

	const handlePointerUp = useCallback( ( event: React.PointerEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
		event.preventDefault();
		if ( disabled || activePointerIdRef.current !== event.pointerId ) {
			resetPointerState();
			return;
		}

		resetPointerState();
		onPress();
	}, [ disabled, onPress, resetPointerState ] );

	const handlePointerCancel = useCallback( ( event: React.PointerEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
		resetPointerState();
	}, [ resetPointerState ] );

	const handleClick = useCallback( ( event: React.MouseEvent<HTMLButtonElement> ) => {
		event.stopPropagation();
		event.preventDefault();
	}, [] );

	const handleKeyDown = useCallback( ( event: React.KeyboardEvent<HTMLButtonElement> ) => {
		if ( disabled ) {
			return;
		}

		if ( event.key !== 'Enter' && event.key !== ' ' ) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		onPress();
	}, [ disabled, onPress ] );

	return (
		<button
			className={className}
			type={type}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			onPointerLeave={handlePointerCancel}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			disabled={disabled}
		>
			{children}
		</button>
	);

}
