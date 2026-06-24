import type React from 'react';

export function StageSelector(props: {
	stages: readonly string[];
	currentIndex: number;
	onSelect(index: number): void;
}): React.JSX.Element {

	return (
		<div className="stage-grid">
			{props.stages.map( ( item, index ) => (
				<button
					key={item}
					className={ `stage-button${index === props.currentIndex ? ' is-active' : ''}` }
					type="button"
					onClick={ () => props.onSelect( index ) }
				>
					{item}
				</button>
			) )}
		</div>
	);

}
