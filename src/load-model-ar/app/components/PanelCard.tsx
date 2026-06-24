import type React from 'react';

export function PanelCard(props: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}): React.JSX.Element {

	return (
		<section className="panel-section">
			<div className="panel-section__header">
				<h3>{props.title}</h3>
				{props.subtitle ? <p>{props.subtitle}</p> : null}
			</div>
			{props.children}
		</section>
	);

}

export const PanelSection = PanelCard;
