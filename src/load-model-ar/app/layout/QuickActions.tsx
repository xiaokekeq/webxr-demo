import type React from 'react';
import { GuardedPressButton } from '../components/GuardedPressButton.js';

export function QuickActions(props: {
	onDisplay(): void;
	onSnapshot(): void;
	onDrawer(): void;
}): React.JSX.Element {

	return (
		<div className="quick-tools">
			<GuardedPressButton className="tool-button" onPress={props.onDisplay}>模式</GuardedPressButton>
			<GuardedPressButton className="tool-button" onPress={props.onSnapshot}>截图</GuardedPressButton>
			<GuardedPressButton className="tool-button" onPress={props.onDrawer}>面板</GuardedPressButton>
		</div>
	);

}
