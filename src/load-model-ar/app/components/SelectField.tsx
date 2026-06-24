import type React from 'react';

export function SelectField(props: {
	label: string;
	value: string;
	onChange(value: string): void;
	options: Array<{ value: string; label: string }>;
}): React.JSX.Element {

	return (
		<label className="field">
			<span>{props.label}</span>
			<select value={props.value} onChange={ ( event ) => props.onChange( event.target.value ) }>
				{props.options.map( ( option ) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				) )}
			</select>
		</label>
	);

}
