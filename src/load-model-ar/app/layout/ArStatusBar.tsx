import type React from 'react';

export function ArStatusBar(props: {
	title: string;
	subtitle: string;
	status: string;
}): React.JSX.Element {

	return (
		<header className="topbar">
			<div>
				<div className="topbar__title">{props.title}</div>
				<div className="topbar__subtitle">{props.subtitle}</div>
			</div>
			<div className="status-pill">{props.status}</div>
		</header>
	);

}
