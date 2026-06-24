import type React from 'react';

export function ActionButton(props: {
	label: string;
	onClick(): void;
	kind?: 'primary' | 'secondary';
	disabled?: boolean;
}): React.JSX.Element {

	return (
		<button
			className={ `action-button${props.kind === 'primary' ? ' action-button--primary' : ''}${props.kind === 'secondary' ? ' action-button--secondary' : ''}` }
			type="button"
			onClick={props.onClick}
			disabled={props.disabled}
		>
			{props.label}
		</button>
	);

}
