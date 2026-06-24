import type React from 'react';

export function BottomTabButton(props: {
	active?: boolean;
	label: string;
	onClick(): void;
}): React.JSX.Element {

	return (
		<button
			className={ `desktop-tab${props.active ? ' is-active' : ''}` }
			type="button"
			onClick={props.onClick}
		>
			{props.label}
		</button>
	);

}
