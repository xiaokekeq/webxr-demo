import React, { useEffect, useState } from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import type { DisplayMode } from '../../registration/registration-store.js';
import { ArCanvas } from './ArCanvas.js';
import { ActionButton } from '../components/ActionButton.js';
import { StageSelector } from '../components/StageSelector.js';
import { getPhaseLabel } from '../store/selectors.js';

const XRAY_SLIDER_VALUE = 52;
const OCCLUSION_SLIDER_VALUE = 86;

export function ArRuntimeView(props: {
	state: AppState;
	actions: AppActions;
	canvasRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {

	const { state, actions, canvasRef } = props;
	const engine = state.engine;
	const currentModelName = engine.availableModels.find( ( item ) => item.id === engine.selectedModelId )?.name ?? '-';
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';
	const isPlaced = engine.arSessionPhase === 'placed';
	const canPlaceModel = engine.arSessionPhase === 'ready-to-place';
	const showPlacementAction = engine.arSessionPhase === 'scanning' || canPlaceModel;
	const [ perspectiveValue, setPerspectiveValue ] = useState<number>(
		getPerspectiveValueForMode( engine.displayMode )
	);

	useEffect( () => {
		setPerspectiveValue( getPerspectiveValueForMode( engine.displayMode ) );
	}, [ engine.displayMode ] );

	function handlePerspectiveChange(event: React.ChangeEvent<HTMLInputElement>): void {

		const nextValue = clampPerspectiveValue( Number( event.target.value ) );
		setPerspectiveValue( nextValue );
		actions.setDisplayMode( getDisplayModeForPerspectiveValue( nextValue ) );

	}

	return (
		<div className="mobile-ar-root mobile-ar-root--simple">
			<ArCanvas canvasRef={canvasRef} className="scene-host scene-host--fullscreen" />

			<div
				className="mobile-overlay"
				data-ar-ui="true"
				onPointerDownCapture={actions.handleArUiInteraction}
				onPointerUpCapture={actions.handleArUiInteraction}
			>
				<header className="ar-simple-topbar">
					<div className="ar-simple-topbar__main">
						<div className="ar-simple-topbar__title">{currentModelName}</div>
						<div className="ar-simple-topbar__meta">
							<span>{currentStage}</span>
							<span>{getPhaseLabel( engine.arSessionPhase )}</span>
						</div>
					</div>
					<div className="ar-simple-topbar__actions">
						{isPlaced ? (
							<ActionButton
								label="\u91cd\u7f6e\u653e\u7f6e"
								onClick={actions.resetPlacement}
								kind="secondary"
							/>
						) : showPlacementAction ? (
							<ActionButton
								label={canPlaceModel ? '\u653e\u7f6e\u6a21\u578b' : '\u7ee7\u7eed\u626b\u63cf'}
								onClick={canPlaceModel ? () => void actions.placeModel() : () => undefined}
								kind={canPlaceModel ? 'primary' : 'secondary'}
								disabled={canPlaceModel === false}
							/>
						) : null}
						<ActionButton label="\u9000\u51fa AR" onClick={actions.exitAr} kind="secondary" />
					</div>
				</header>

				<section className="ar-simple-stagebar">
					<div className="ar-simple-stagebar__header">
						<strong>\u751f\u547d\u5468\u671f\u9636\u6bb5</strong>
						<span>
							{'\u5207\u6362\u9636\u6bb5\u4e0d\u4f1a\u4fee\u6539\u914d\u51c6\u3001Marker \u6216\u6a21\u578b\u653e\u7f6e\u4f4d\u59ff\u3002'}
						</span>
					</div>
					<StageSelector
						stages={engine.timelineStages}
						currentIndex={engine.currentTimelineStageIndex}
						onSelect={actions.setTimelineStage}
					/>
				</section>

				{engine.hasSelection ? (
					<section className="ar-property-card">
						<div className="ar-property-card__header">
							<strong>\u6784\u4ef6\u5c5e\u6027</strong>
							<button
								type="button"
								className="ar-property-card__close"
								onClick={actions.closePropertyPanel}
							>
								{'\u5173\u95ed'}
							</button>
						</div>
						<div className="ar-property-card__grid">
							<div>
								<span>Mesh</span>
								<strong>{engine.propertyPanel.meshName ?? engine.propertyPanel.name}</strong>
							</div>
							<div>
								<span>Material</span>
								<strong>{engine.propertyPanel.materialName ?? engine.propertyPanel.material}</strong>
							</div>
							<div>
								<span>{'\u9636\u6bb5'}</span>
								<strong>{currentStage}</strong>
							</div>
							<div>
								<span>{'\u900f\u89c6\u503c'}</span>
								<strong>{perspectiveValue}</strong>
							</div>
						</div>
					</section>
				) : null}

				<section className="ar-perspective-panel">
					<div className="ar-perspective-panel__header">
						<div>
							<strong>{'\u900f\u89c6\u6ed1\u6761'}</strong>
							<span>{getPerspectiveHint( perspectiveValue )}</span>
						</div>
						<strong>{perspectiveValue}</strong>
					</div>
					<input
						className="ar-perspective-panel__slider"
						type="range"
						min="0"
						max="100"
						step="1"
						value={perspectiveValue}
						onChange={handlePerspectiveChange}
						disabled={isPlaced === false}
					/>
					<div className="ar-perspective-panel__legend">
						<span>{'0 \u666e\u901a\u5b9e\u4f53'}</span>
						<span>{'1-40 \u534a\u900f\u660e'}</span>
						<span>{'41-70 \u5206\u5c42\u900f\u89c6'}</span>
						<span>{'71-100 \u5f3a\u900f\u89c6'}</span>
					</div>
				</section>
			</div>
		</div>
	);

}

function clampPerspectiveValue(value: number): number {

	if ( Number.isFinite( value ) === false ) {
		return 0;
	}

	return Math.min( 100, Math.max( 0, Math.round( value ) ) );

}

function getPerspectiveValueForMode(mode: DisplayMode): number {

	if ( mode === 'xray' ) {
		return XRAY_SLIDER_VALUE;
	}

	if ( mode === 'occlusion-outline' ) {
		return OCCLUSION_SLIDER_VALUE;
	}

	return 0;

}

function getDisplayModeForPerspectiveValue(value: number): DisplayMode {

	if ( value >= 71 ) {
		return 'occlusion-outline';
	}

	if ( value >= 1 ) {
		return 'xray';
	}

	return 'normal';

}

function getPerspectiveHint(value: number): string {

	if ( value >= 71 ) {
		return '\u5f3a\u900f\u89c6 / \u5256\u5207\u9884\u7559';
	}

	if ( value >= 41 ) {
		return '\u5206\u5c42\u900f\u89c6';
	}

	if ( value >= 1 ) {
		return '\u9010\u6e10\u534a\u900f\u660e';
	}

	return '\u666e\u901a\u5b9e\u4f53';

}
