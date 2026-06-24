import type React from 'react';
import { GuardedPressButton } from './GuardedPressButton.js';

export function ActionButton(props: {
	label: string;
	onClick(): void;
	kind?: 'primary' | 'secondary';
	disabled?: boolean;
}): React.JSX.Element {

	return (
		<GuardedPressButton
			className={ `action-button${props.kind === 'primary' ? ' action-button--primary' : ''}${props.kind === 'secondary' ? ' action-button--secondary' : ''}` }
			onPress={props.onClick}
			disabled={props.disabled}
		>
			{props.label}
		</GuardedPressButton>
	);

}
