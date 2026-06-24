import type React from 'react';
import type { DisplayMode } from '../../registration/registration-store.js';
import { DISPLAY_MODE_OPTIONS } from '../store/selectors.js';
import { SelectField } from './SelectField.js';

export function DisplayModeSelector(props: {
	label?: string;
	value: DisplayMode;
	onChange(mode: DisplayMode): void;
}): React.JSX.Element {

	return (
		<SelectField
			label={props.label ?? '显示模式'}
			value={props.value}
			onChange={ ( value ) => props.onChange( value as DisplayMode ) }
			options={DISPLAY_MODE_OPTIONS}
		/>
	);

}

