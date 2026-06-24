import type React from 'react';
import { GuardedPressButton } from '../components/GuardedPressButton.js';

export function QuickActions(props: {
	onDisplay(): void;
	onSnapshot(): void;
	onDrawer(): void;
	displayLabel: string;
	displayDisabled?: boolean;
}): React.JSX.Element {

	return (
		<div className="quick-tools">
			<GuardedPressButton className="tool-button tool-button--stacked" onPress={props.onDisplay} disabled={props.displayDisabled}>
				<span>模式</span>
				<strong>{props.displayLabel}</strong>
			</GuardedPressButton>
			<GuardedPressButton className="tool-button" onPress={props.onSnapshot}>截图</GuardedPressButton>
			<GuardedPressButton className="tool-button" onPress={props.onDrawer}>面板</GuardedPressButton>
		</div>
	);

}
