import React, { useEffect, useState } from 'react';
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
	const [ perspectiveValue, setPerspectiveValue ] = useState<number>(
		getPerspectiveValueForMode( engine.displayMode )
	);
	const [ stagePickerOpen, setStagePickerOpen ] = useState( false );
	const [ propertyCardOpen, setPropertyCardOpen ] = useState( false );

	useEffect( () => {
		setPerspectiveValue( getPerspectiveValueForMode( engine.displayMode ) );
	}, [ engine.displayMode ] );

	useEffect( () => {
		if ( engine.hasSelection ) {
			setPropertyCardOpen( true );
		}
	}, [ engine.hasSelection ] );

	function handlePerspectiveChange(event: React.ChangeEvent<HTMLInputElement>): void {

		const nextValue = clampPerspectiveValue( Number( event.target.value ) );
		setPerspectiveValue( nextValue );
		actions.setDisplayMode( getDisplayModeForPerspectiveValue( nextValue ) );

	}

	function handleStageSelect(index: number): void {

		actions.setTimelineStage( index );
		setStagePickerOpen( false );

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
							className="ar-pill-button"
							onClick={ () => setStagePickerOpen( ( current ) => !current ) }
						>
							<span>{currentStage}</span>
							<span className={ `ar-pill-button__chevron${stagePickerOpen ? ' is-open' : ''}` }>▼</span>
						</button>
						<ActionButton label="退出 AR" onClick={actions.exitAr} kind="secondary" />
					</div>
				</header>

				{stagePickerOpen ? (
					<section className="ar-stage-popover">
						<div className="ar-stage-popover__title">生命周期</div>
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
									onClick={ () => {
										setPropertyCardOpen( false );
										if ( engine.hasSelection ) {
											actions.closePropertyPanel();
										}
									} }
								>
									关闭
								</button>
							</div>
							<div className="ar-compact-property-card__grid">
								<div>
									<span>当前阶段</span>
									<strong>{currentStage}</strong>
								</div>
								<div>
									<span>透视强度</span>
									<strong>{perspectiveValue}</strong>
								</div>
								<div>
									<span>当前构件</span>
									<strong>{getCurrentMeshName( engine.hasSelection, engine.propertyPanel.meshName )}</strong>
								</div>
								<div>
									<span>材质名称</span>
									<strong>{getCurrentMaterialName( engine.hasSelection, engine.propertyPanel.materialName )}</strong>
								</div>
							</div>
							<div className="ar-compact-property-card__hint">
								{engine.hasSelection ? '点击空白处或关闭按钮可收起属性卡。' : '点击模型构件查看属性。'}
							</div>
						</section>
					) : null}
				</div>

				<section className="ar-minimal-perspective">
					<div className="ar-minimal-perspective__header">
						<strong>透视</strong>
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
					/>
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

function getCurrentMeshName(hasSelection: boolean, meshName: string | undefined): string {

	if ( hasSelection === false ) {
		return '未选择';
	}

	if ( typeof meshName === 'string' && meshName.trim().length > 0 ) {
		return meshName;
	}

	return '未命名构件';

}

function getCurrentMaterialName(hasSelection: boolean, materialName: string | undefined): string {

	if ( hasSelection === false ) {
		return '未命名材质';
	}

	if ( typeof materialName === 'string' && materialName.trim().length > 0 && materialName !== '-' ) {
		return materialName;
	}

	return '未命名材质';

}
