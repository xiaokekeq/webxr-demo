import React, { useEffect, useState } from 'react';
import { GuardedPressButton } from '../components/GuardedPressButton.js';
import type { WorkspaceMode } from '../../registration/registration-store.js';
import { getWorkspaceLabel } from '../store/selectors.js';

const DRAWER_EXIT_MS = 180;

export function BottomDrawer(props: {
	open: boolean;
	workspaceMode: WorkspaceMode;
	onToggle(): void;
	toggleLabel?: string;
	children: React.ReactNode;
}): React.JSX.Element {

	const [ shouldRenderContent, setShouldRenderContent ] = useState( props.open );

	useEffect( () => {
		if ( props.open ) {
			setShouldRenderContent( true );
			return;
		}

		const timeoutId = window.setTimeout( () => {
			setShouldRenderContent( false );
		}, DRAWER_EXIT_MS );

		return () => {
			window.clearTimeout( timeoutId );
		};
	}, [ props.open ] );

	return (
		<>
			{shouldRenderContent ? (
				<div
					className={ `drawer-anchor${props.open ? '' : ' is-collapsed'}` }
					aria-hidden={!props.open}
				>
					<div className="drawer-card">{props.children}</div>
				</div>
			) : null}
			<GuardedPressButton className="drawer-toggle" onPress={props.onToggle}>
				<span>{props.toggleLabel ?? ( props.open ? '收起面板' : `展开${getWorkspaceLabel( props.workspaceMode )}` )}</span>
			</GuardedPressButton>
		</>
	);

}
