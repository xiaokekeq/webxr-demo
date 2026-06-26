import type React from 'react';

export function SegmentedField(props: {
	label: string;
	value: string;
	onChange(value: string): void;
	options: Array<{ value: string; label: string }>;
}): React.JSX.Element {

	function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {

		const currentIndex = props.options.findIndex( ( option ) => option.value === props.value );
		if ( currentIndex === -1 ) {
			return;
		}

		const moveNext = event.key === 'ArrowRight' || event.key === 'ArrowDown';
		const movePrev = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
		if ( moveNext === false && movePrev === false ) {
			return;
		}

		event.preventDefault();
		const offset = moveNext ? 1 : -1;
		const nextIndex = ( currentIndex + offset + props.options.length ) % props.options.length;
		props.onChange( props.options[ nextIndex ]!.value );

	}

	return (
		<div className="field segmented-field">
			<span>{props.label}</span>
			<div
				className="segmented-field__list"
				role="radiogroup"
				aria-label={props.label}
				onKeyDown={handleKeyDown}
			>
				{props.options.map( ( option ) => (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={props.value === option.value}
						tabIndex={props.value === option.value ? 0 : -1}
						className={ `segmented-field__option${props.value === option.value ? ' is-active' : ''}` }
						onClick={ () => props.onChange( option.value ) }
					>
						{option.label}
					</button>
				) )}
			</div>
		</div>
	);

}
