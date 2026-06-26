import type React from 'react';
import { GuardedPressButton } from '../components/GuardedPressButton.js';

export function ArStatusBar(props: {
	title: string;
	subtitle: string;
	debugSubtitle?: string;
	status: string;
	onStatusClick?(): void;
	statusDisabled?: boolean;
}): React.JSX.Element {

	const statusContent = props.onStatusClick ? (
		<GuardedPressButton
			className="status-pill status-pill--button"
			onPress={props.onStatusClick}
			disabled={props.statusDisabled}
		>
			{props.status}
		</GuardedPressButton>
	) : (
		<div className="status-pill">{props.status}</div>
	);

	return (
		<header className="topbar">
			<div>
				<div className="topbar__title">{props.title}</div>
				<div className="topbar__subtitle">{props.subtitle}</div>
				{props.debugSubtitle ? <div className="topbar__debug">{props.debugSubtitle}</div> : null}
			</div>
			{statusContent}
		</header>
	);

}
