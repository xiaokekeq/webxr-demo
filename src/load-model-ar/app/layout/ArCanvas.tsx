import type React from 'react';

export function ArCanvas(props: {
	canvasRef: React.RefObject<HTMLDivElement | null>;
	className: string;
}): React.JSX.Element {

	return <div ref={props.canvasRef} className={props.className} />;

}
