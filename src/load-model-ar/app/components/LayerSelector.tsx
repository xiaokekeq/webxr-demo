import type React from 'react';

export function LayerSelector(props: {
	layers: readonly string[];
}): React.JSX.Element {

	return (
		<div className="chip-list">
			{props.layers.map( ( item ) => (
				<span key={item} className="chip">{item}</span>
			) )}
		</div>
	);

}
