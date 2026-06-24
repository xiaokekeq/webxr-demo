import type React from 'react';

export function StatusBadge(props: {
	label: string;
	tone?: 'default' | 'supported' | 'unsupported' | 'checking';
}): React.JSX.Element {

	const toneClass = props.tone && props.tone !== 'default'
		? ` support-badge--${props.tone}`
		: '';

	return <span className={ `support-badge${toneClass}` }>{props.label}</span>;

}
