import React, { useEffect, useMemo, useState } from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import type { DisplayMode } from '../../registration/registration-store.js';
import { ArCanvas } from './ArCanvas.js';
import { ActionButton } from '../components/ActionButton.js';

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
	const hasPlacedModel = engine.arSessionPhase === 'placed';
	const hitTestReady = engine.arSessionPhase === 'ready-to-place' || engine.arSessionPhase === 'placing' || hasPlacedModel;
	const canPlace = engine.arSessionPhase === 'ready-to-place';
	const usePreviewPlacement = engine.autoPreviewPlacementEnabled;
	const placementButtonLabel = getPlacementButtonLabel( engine.arSessionPhase, hasPlacedModel, canPlace );
	const [ perspectiveValue, setPerspectiveValue ] = useState<number>(
		getPerspectiveValueForMode( engine.displayMode )
	);
	const [ stagePickerOpen, setStagePickerOpen ] = useState( false );
	const [ propertyCardOpen, setPropertyCardOpen ] = useState( false );

	const propertyCardItems = useMemo( () => ( [
		{
			label: '\u5f53\u524d\u9636\u6bb5',
			value: currentStage
		},
		{
			label: '\u900f\u89c6\u5f3a\u5ea6',
			value: String( perspectiveValue )
		},
		{
			label: '\u5f53\u524d\u6784\u4ef6',
			value: getCurrentMeshName( engine.hasSelection, engine.propertyPanel.meshName )
		},
		{
			label: '\u6750\u8d28\u540d\u79f0',
			value: getCurrentMaterialName( engine.hasSelection, engine.propertyPanel.materialName )
		}
	] ), [ currentStage, engine.hasSelection, engine.propertyPanel.materialName, engine.propertyPanel.meshName, perspectiveValue ] );

	useEffect( () => {
		setPerspectiveValue( getPerspectiveValueForMode( engine.displayMode ) );
	}, [ engine.displayMode ] );

	useEffect( () => {
		if ( engine.hasSelection ) {
			setPropertyCardOpen( true );
		}
	}, [ engine.hasSelection ] );

	useEffect( () => {
		console.info( '[MinimalPlacementUI]', {
			hasPlacedModel,
			hitTestReady,
			canPlace,
			placementButtonLabel
		} );
	}, [ canPlace, hasPlacedModel, hitTestReady, placementButtonLabel ] );

	function handlePerspectiveChange(event: React.ChangeEvent<HTMLInputElement>): void {

		const nextValue = clampPerspectiveValue( Number( event.target.value ) );
		setPerspectiveValue( nextValue );
		actions.setDisplayMode( getDisplayModeForPerspectiveValue( nextValue ) );

	}

	function handleStageSelect(index: number): void {

		actions.setTimelineStage( index );
		setStagePickerOpen( false );

	}

	function handlePlaceModel(): void {

		console.info( '[PlaceModelRequested]', {
			canPlace,
			hasHitTest: hitTestReady,
			selectedModelId: engine.selectedModelId
		} );

		if ( canPlace === false ) {
			return;
		}

		void actions.placeModel();

	}

	function handleResetPlacement(): void {

		console.info( '[ResetPlacementRequested]', {
			hasPlacedModel
		} );
		actions.resetPlacement();

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
				<header className="ar-minimal-topbar">
					<div className="ar-minimal-topbar__model" title={currentModelName}>
						{currentModelName}
					</div>
					<div className="ar-minimal-topbar__actions">
						<button
							type="button"
							className={ `ar-mini-toggle${usePreviewPlacement ? ' is-active' : ''}` }
							onClick={ () => actions.setAutoPreviewPlacementEnabled( !usePreviewPlacement ) }
						>
							<span className="ar-mini-toggle__label">{'\u524d\u65b9\u9884\u89c8'}</span>
							<span className="ar-mini-toggle__value">
								{usePreviewPlacement ? '\u5df2\u5173\u95ed\u771f\u5b9e\u4f4d\u7f6e' : '\u4f7f\u7528\u771f\u5b9e\u4f4d\u7f6e'}
							</span>
						</button>
						<button
							type="button"
							className="ar-pill-button"
							onClick={ () => setStagePickerOpen( ( current ) => !current ) }
						>
							<span>{currentStage}</span>
							<span className={ `ar-pill-button__chevron${stagePickerOpen ? ' is-open' : ''}` }>{'\u25be'}</span>
						</button>
						<ActionButton label={'\u9000\u51fa AR'} onClick={actions.exitAr} kind="secondary" />
					</div>
				</header>

				{stagePickerOpen ? (
					<section className="ar-stage-popover">
						<div className="ar-stage-popover__title">{'\u751f\u547d\u5468\u671f'}</div>
						<div className="ar-stage-popover__list">
							{engine.timelineStages.map( ( stage, index ) => (
								<button
									key={stage}
									type="button"
									className={ `ar-stage-popover__item${index === engine.currentTimelineStageIndex ? ' is-active' : ''}` }
									onClick={ () => handleStageSelect( index ) }
								>
									{stage}
								</button>
							))}
						</div>
					</section>
				) : null}

				{hasPlacedModel ? null : (
					<div className={ `ar-placement-crosshair${hitTestReady ? ' is-ready' : ''}` } aria-hidden="true">
						<div className="ar-placement-crosshair__ring" />
						<div className="ar-placement-crosshair__line ar-placement-crosshair__line--h" />
						<div className="ar-placement-crosshair__line ar-placement-crosshair__line--v" />
					</div>
				)}

				<div className="ar-model-capsule-stack">
					<button
						type="button"
						className="ar-model-capsule"
						onClick={ () => setPropertyCardOpen( ( current ) => !current ) }
					>
						{currentModelName}
					</button>

					{propertyCardOpen ? (
						<section className="ar-compact-property-card">
							<div className="ar-compact-property-card__header">
								<strong>{currentModelName}</strong>
								<button
									type="button"
									className="ar-compact-property-card__close"
									onClick={ () => setPropertyCardOpen( false ) }
								>
									{'\u5173\u95ed'}
								</button>
							</div>
							<div className="ar-compact-property-card__grid">
								{propertyCardItems.map( ( item ) => (
									<div key={item.label}>
										<span>{item.label}</span>
										<strong>{item.value}</strong>
									</div>
								) )}
							</div>
							<div className="ar-compact-property-card__hint">
								{engine.hasSelection
									? '\u70b9\u51fb\u6a21\u578b\u5176\u4ed6\u6784\u4ef6\u53ef\u7ee7\u7eed\u66f4\u65b0\u5c5e\u6027\u3002'
									: '\u70b9\u51fb\u6a21\u578b\u6784\u4ef6\u67e5\u770b\u5c5e\u6027\u3002'}
							</div>
						</section>
					) : null}
				</div>

				<section className="ar-placement-bar">
					{hasPlacedModel ? (
						<button
							type="button"
							className="ar-placement-button ar-placement-button--secondary"
							onClick={handleResetPlacement}
						>
							{'\u91cd\u65b0\u653e\u7f6e'}
						</button>
					) : (
						<button
							type="button"
							className={ `ar-placement-button${canPlace ? ' is-active' : ''}` }
							onClick={handlePlaceModel}
							disabled={canPlace === false}
						>
							{placementButtonLabel}
						</button>
					)}
				</section>

				<section className="ar-minimal-perspective">
					<div className="ar-minimal-perspective__header">
						<strong>{'\u900f\u89c6'}</strong>
						<span>{perspectiveValue}</span>
					</div>
					<input
						className="ar-minimal-perspective__slider"
						type="range"
						min="0"
						max="100"
						step="1"
						value={perspectiveValue}
						onChange={handlePerspectiveChange}
						disabled={hasPlacedModel === false}
					/>
					{hasPlacedModel ? null : (
						<div className="ar-minimal-perspective__hint">{'\u8bf7\u5148\u653e\u7f6e\u6a21\u578b'}</div>
					)}
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

function getPlacementButtonLabel(
	phase: AppState['engine']['arSessionPhase'],
	hasPlacedModel: boolean,
	canPlace: boolean
): string {

	if ( hasPlacedModel ) {
		return '\u91cd\u65b0\u653e\u7f6e';
	}

	if ( canPlace ) {
		return '\u653e\u7f6e\u6a21\u578b';
	}

	if ( phase === 'placing' ) {
		return '\u6b63\u5728\u653e\u7f6e...';
	}

	return '\u626b\u63cf\u5e73\u9762\u4e2d...';

}

function getCurrentMeshName(hasSelection: boolean, meshName: string | undefined): string {

	if ( hasSelection === false ) {
		return '\u672a\u9009\u62e9';
	}

	if ( typeof meshName === 'string' && meshName.trim().length > 0 ) {
		return meshName;
	}

	return '\u672a\u547d\u540d\u6784\u4ef6';

}

function getCurrentMaterialName(hasSelection: boolean, materialName: string | undefined): string {

	if ( hasSelection === false ) {
		return '\u672a\u547d\u540d\u6750\u8d28';
	}

	if ( typeof materialName === 'string' && materialName.trim().length > 0 && materialName !== '-' ) {
		return materialName;
	}

	return '\u672a\u547d\u540d\u6750\u8d28';

}
