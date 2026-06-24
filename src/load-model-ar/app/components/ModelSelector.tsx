import type React from 'react';
import type { ModelCatalogItem } from '../../data/model-catalog.js';
import { SelectField } from './SelectField.js';

export function ModelSelector(props: {
	label?: string;
	models: ModelCatalogItem[];
	selectedModelId: string;
	onChange(modelId: string): void;
}): React.JSX.Element {

	return (
		<SelectField
			label={props.label ?? '模型选择'}
			value={props.selectedModelId}
			onChange={props.onChange}
			options={props.models.map( ( item ) => ( {
				value: item.id,
				label: item.name
			} ) )}
		/>
	);

}
