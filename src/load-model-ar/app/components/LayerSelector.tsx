import type React from 'react';
import type { ModelLayerState } from '../../registration/registration-store.js';
import { ActionButton } from './ActionButton.js';

export function LayerSelector(props: {
	layers: readonly ModelLayerState[];
	onHideTopLayer(): void;
	onRestoreLayer(): void;
	onResetLayers(): void;
}): React.JSX.Element {

	const hiddenCount = props.layers.filter( ( layer ) => layer.visible === false ).length;
	const hasLayers = props.layers.length > 0;

	return (
		<div className="layer-panel">
			<div className="button-row button-row--compact layer-panel__actions">
				<ActionButton
					label="隐藏上层"
					onClick={props.onHideTopLayer}
					disabled={hasLayers === false || hiddenCount >= props.layers.length}
				/>
				<ActionButton
					label="恢复一层"
					onClick={props.onRestoreLayer}
					disabled={hiddenCount === 0}
					kind="secondary"
				/>
				<ActionButton
					label="全部恢复"
					onClick={props.onResetLayers}
					disabled={hasLayers === false || hiddenCount === 0}
					kind="secondary"
				/>
			</div>

			{hasLayers ? (
				<div className="layer-list">
					{props.layers.map( ( layer ) => (
						<div key={layer.id} className={ `layer-item${layer.visible ? '' : ' is-hidden'}` }>
							<div className="layer-item__main">
								<strong>{layer.label}</strong>
								<span>{layer.visible ? `透明度 ${( layer.opacity * 100 ).toFixed( 0 )}%` : '已隐藏'}</span>
							</div>
							<div className="layer-item__meta">
								<span>{`第 ${layer.orderIndex + 1} 层`}</span>
							</div>
						</div>
					) )}
				</div>
			) : (
				<p className="note-block">当前模型没有识别出可剥离的分层，后续可以再补显式楼层配置。</p>
			)}
		</div>
	);

}
