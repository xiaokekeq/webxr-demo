import type React from 'react';

export function QuickActions(props: {
	onDisplay(): void;
	onSnapshot(): void;
	onDrawer(): void;
}): React.JSX.Element {

	return (
		<div className="quick-tools">
			<button className="tool-button" type="button" onClick={props.onDisplay}>模式</button>
			<button className="tool-button" type="button" onClick={props.onSnapshot}>截图</button>
			<button className="tool-button" type="button" onClick={props.onDrawer}>面板</button>
		</div>
	);

}
