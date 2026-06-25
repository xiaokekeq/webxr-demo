import type React from 'react';

export function StatusBadge(props: {
	label: string;
	tone?: 'default' | 'supported' | 'unsupported' | 'checking';
}): React.JSX.Element {

	const className = [
		'support-badge',
		props.tone && props.tone !== 'default' ? `support-badge--${props.tone}` : ''
	].filter( Boolean ).join( ' ' );

	return <span className={className}>{props.label}</span>;

}
