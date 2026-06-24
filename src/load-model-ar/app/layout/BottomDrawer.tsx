import type React from 'react';
import { GuardedPressButton } from '../components/GuardedPressButton.js';
import type { WorkspaceMode } from '../../registration/registration-store.js';
import { getWorkspaceLabel } from '../store/selectors.js';

export function BottomDrawer(props: {
	open: boolean;
	workspaceMode: WorkspaceMode;
	onToggle(): void;
	toggleLabel?: string;
	children: React.ReactNode;
}): React.JSX.Element {

	return (
		<>
			<div className={ `drawer-anchor${props.open ? '' : ' is-collapsed'}` }>
				<div className="drawer-card">{props.children}</div>
			</div>
			<GuardedPressButton className="drawer-toggle" onPress={props.onToggle}>
				<span>{props.toggleLabel ?? ( props.open ? '收起面板' : `展开${getWorkspaceLabel( props.workspaceMode )}` )}</span>
			</GuardedPressButton>
		</>
	);

}
