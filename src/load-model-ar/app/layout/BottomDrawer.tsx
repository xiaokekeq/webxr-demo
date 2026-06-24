import type React from 'react';
import type { WorkspaceMode } from '../../registration/registration-store.js';
import { getWorkspaceLabel } from '../store/selectors.js';

export function BottomDrawer(props: {
	open: boolean;
	workspaceMode: WorkspaceMode;
	onToggle(): void;
	children: React.ReactNode;
}): React.JSX.Element {

	return (
		<>
			<div className={ `drawer-anchor${props.open ? '' : ' is-collapsed'}` }>
				<div className="drawer-card">{props.children}</div>
			</div>
			<button className="drawer-toggle" type="button" onClick={props.onToggle}>
				<span>{props.open ? '收起面板' : `展开${getWorkspaceLabel( props.workspaceMode )}`}</span>
			</button>
		</>
	);

}
