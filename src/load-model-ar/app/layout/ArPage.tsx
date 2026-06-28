import React, { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
	disposeAppRuntime,
	initializeAppRuntime,
	mountAppHosts,
	setAppLayoutMode,
	useAppActions
} from '../store/ar-store.js';
import { useAppStore } from '../store/ar-store.js';
import { PreArView } from './PreArView.js';
import { ArRuntimeView } from './ArRuntimeView.js';
import { ArCanvas } from './ArCanvas.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ActionButton } from '../components/ActionButton.js';
import { ModelSelector } from '../components/ModelSelector.js';
import { StageSelector } from '../components/StageSelector.js';
import { getSupportLabel } from '../store/selectors.js';

function useDesktopLayout(): boolean {

	const query = '(any-pointer: fine)';
	const subscribe = (listener: () => void): (() => void) => {
		const media = window.matchMedia( query );
		media.addEventListener( 'change', listener );
		return () => {
			media.removeEventListener( 'change', listener );
		};
	};

	const getSnapshot = (): boolean => window.matchMedia( query ).matches;
	return useSyncExternalStore( subscribe, getSnapshot, () => false );

}

export function ArPage(): React.JSX.Element {

	const state = useAppStore( ( currentState ) => currentState );
	const actions = useAppActions();
	const isDesktopLayout = useDesktopLayout();
	const arCanvasRef = useRef<HTMLDivElement | null>( null );
	const preArCanvasRef = useRef<HTMLDivElement | null>( null );
	const desktopCanvasRef = useRef<HTMLDivElement | null>( null );
	const xrButtonRef = useRef<HTMLDivElement | null>( null );
	const engine = state.engine;
	const currentModelName = engine.availableModels.find( ( item ) => item.id === engine.selectedModelId )?.name ?? '-';
	const currentStage = engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-';

	useEffect( () => {
		void initializeAppRuntime();
		return () => {
			disposeAppRuntime();
		};
	}, [] );

	useEffect( () => {
		setAppLayoutMode( isDesktopLayout );
	}, [ isDesktopLayout ] );

	useLayoutEffect( () => {
		const className = 'app-mode--ar-session';
		if ( state.engine.appMode === 'ar-session' ) {
			document.documentElement.classList.add( className );
			document.body.classList.add( className );
			return () => {
				document.documentElement.classList.remove( className );
				document.body.classList.remove( className );
			};
		}

		document.documentElement.classList.remove( className );
		document.body.classList.remove( className );
		return () => {
			document.documentElement.classList.remove( className );
			document.body.classList.remove( className );
		};
	}, [ state.engine.appMode ] );

	useLayoutEffect( () => {
		if (
			arCanvasRef.current === null
			|| preArCanvasRef.current === null
			|| desktopCanvasRef.current === null
			|| xrButtonRef.current === null
		) {
			return;
		}

		mountAppHosts( {
			arCanvasHost: arCanvasRef.current,
			preArCanvasHost: preArCanvasRef.current,
			desktopCanvasHost: desktopCanvasRef.current,
			xrButtonHost: xrButtonRef.current
		} );
	}, [ state.engine.appMode, isDesktopLayout ] );

	if ( isDesktopLayout ) {
		if ( engine.appMode === 'ar-session' ) {
			return (
				<>
					<ArCanvas canvasRef={preArCanvasRef} className="scene-host scene-host--hidden" />
					<ArCanvas canvasRef={desktopCanvasRef} className="scene-host scene-host--hidden" />
					<div ref={xrButtonRef} className="xr-button-wrap" />
					<ArRuntimeView
						state={state}
						actions={actions}
						canvasRef={arCanvasRef}
					/>
				</>
			);
		}

		return (
			<>
				<ArCanvas canvasRef={arCanvasRef} className="scene-host scene-host--hidden" />
				<ArCanvas canvasRef={preArCanvasRef} className="scene-host scene-host--hidden" />
				<div ref={xrButtonRef} className="xr-button-wrap" />
				<div className="desktop-shell desktop-shell--simple">
					<header className="desktop-header">
						<div>
							<h1>{'\u5824\u9632\u73b0\u573a\u8f85\u52a9\u6838\u67e5'}</h1>
							<p>{'\u9009\u62e9\u6a21\u578b\u4e0e\u751f\u547d\u5468\u671f\u9636\u6bb5\u540e\uff0c\u518d\u8fdb\u5165 AR \u8fdb\u884c\u73b0\u573a\u6838\u67e5\u3002'}</p>
						</div>
						<div className="desktop-header__meta">
							<StatusBadge label={getSupportLabel( engine.arSupportState )} tone={engine.arSupportState} />
						</div>
					</header>

					<div className="desktop-home-grid">
						<section className="desktop-preview desktop-preview--simple">
							<div className="desktop-preview__badge">{engine.desktopPreviewBadge}</div>
							<div className="desktop-preview__canvas">
								<ArCanvas canvasRef={desktopCanvasRef} className="scene-host scene-host--desktop" />
							</div>
						</section>

						<aside className="desktop-home-panel">
							<section className="panel-section">
								<div className="panel-section__header">
									<h3>{'\u5f53\u524d\u9009\u62e9'}</h3>
									<p>{currentModelName} / {currentStage}</p>
								</div>
								<div className="field-grid field-grid--single">
									<ModelSelector
										label={'\u6a21\u578b\u9009\u62e9'}
										models={engine.availableModels}
										selectedModelId={engine.selectedModelId}
										onChange={actions.selectModel}
									/>
								</div>
								<div className="page-section-label">{'\u751f\u547d\u5468\u671f\u9636\u6bb5'}</div>
								<StageSelector
									stages={engine.timelineStages}
									currentIndex={engine.currentTimelineStageIndex}
									onSelect={actions.setTimelineStage}
								/>
								<div className="button-row">
									<ActionButton
										label={'\u8fdb\u5165 AR'}
										onClick={actions.enterAr}
										kind="primary"
										disabled={engine.arSupportState !== 'supported'}
										activationBehavior="native-click"
									/>
								</div>
							</section>

							<section className="panel-section">
								<div className="panel-section__header">
									<h3>{'\u8bf4\u660e'}</h3>
									<p>{'\u4e3b\u9875\u4ec5\u4fdd\u7559\u6a21\u578b\u9884\u89c8\u3001\u6a21\u578b\u9009\u62e9\u4e0e\u751f\u547d\u5468\u671f\u9636\u6bb5\u5207\u6362\u3002'}</p>
								</div>
								<p className="support-copy">{engine.arSupportMessage}</p>
							</section>
						</aside>
					</div>
				</div>
			</>
		);
	}

	return (
		<div className="mobile-page-root">
			<div ref={xrButtonRef} className="xr-button-wrap" />
			<ArCanvas canvasRef={desktopCanvasRef} className="scene-host scene-host--hidden" />
			<div
				className={ `mobile-view-shell${state.engine.appMode === 'ar-session' ? ' mobile-view-shell--hidden' : ''}` }
				aria-hidden={state.engine.appMode === 'ar-session'}
			>
				<PreArView
					state={state}
					actions={actions}
					canvasRef={preArCanvasRef}
				/>
			</div>
			<div
				className={ `mobile-view-shell${state.engine.appMode === 'ar-session' ? '' : ' mobile-view-shell--hidden'}` }
				aria-hidden={state.engine.appMode !== 'ar-session'}
			>
				<ArRuntimeView
					state={state}
					actions={actions}
					canvasRef={arCanvasRef}
				/>
			</div>
		</div>
	);

}
