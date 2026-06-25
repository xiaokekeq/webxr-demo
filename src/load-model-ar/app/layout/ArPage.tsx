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
import { getSupportLabel } from '../store/selectors.js';
import { BrowsePanel } from '../panels/BrowsePanel.js';
import { RegistrationPanel } from '../panels/RegistrationPanel.js';
import { ToolsPanel } from '../panels/ToolsPanel.js';
import { InspectionPanel } from '../panels/InspectionPanel.js';

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

	useEffect( () => {
		void initializeAppRuntime();
		return () => {
			disposeAppRuntime();
		};
	}, [] );

	useEffect( () => {
		setAppLayoutMode( isDesktopLayout );
	}, [ isDesktopLayout ] );

	useEffect( () => {
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
		const engine = state.engine;
		return (
			<>
				<ArCanvas canvasRef={arCanvasRef} className="scene-host scene-host--hidden" />
				<ArCanvas canvasRef={preArCanvasRef} className="scene-host scene-host--hidden" />
				<div ref={xrButtonRef} className="xr-button-wrap" />
				<div className="desktop-shell">
					<header className="desktop-header">
						<div>
							<h1>{engine.projectName}</h1>
							<p>
								{engine.availableModels.find( ( item ) => item.id === engine.selectedModelId )?.name ?? '-'}
								{' / '}
								{engine.timelineStages[ engine.currentTimelineStageIndex ] ?? '-'}
							</p>
						</div>
						<div className="desktop-header__meta">
							<StatusBadge label={getSupportLabel( engine.arSupportState )} tone={engine.arSupportState} />
							<span className="status-pill status-pill--muted">桌面预览</span>
						</div>
					</header>

					<div className="desktop-grid">
						<div className="desktop-preview-stack">
							<section className="desktop-preview">
								<div className="desktop-preview__badge">{engine.desktopPreviewBadge}</div>
								<div className="desktop-preview__canvas">
									<ArCanvas canvasRef={desktopCanvasRef} className="scene-host scene-host--desktop" />
								</div>
							</section>

							<section className="desktop-log-panel">
								<div className="desktop-preview__info">
									<div className="desktop-info-card">
										<strong>加载信息</strong>
										<span>{engine.runtimeStatus}</span>
									</div>
									<div className="desktop-info-card">
										<strong>配准状态</strong>
										<span>{engine.registrationStatusDetail}</span>
									</div>
								</div>
								<strong>运行日志</strong>
								<div className="desktop-log-list">
									{engine.logMessages.length > 0 ? engine.logMessages.slice( 0, 4 ).map( ( item ) => (
										<div key={item} className="desktop-log-item">{item}</div>
									) ) : <div className="desktop-log-item">正在等待模型与配准信息加载。</div>}
								</div>
							</section>
						</div>

						<aside className="desktop-panel">
							<div className="desktop-tabs">
								<button
									className={ `desktop-tab${engine.workspaceMode === 'browse' ? ' is-active' : ''}` }
									type="button"
									onClick={ () => actions.activatePanel( 'browse' ) }
								>
									浏览
								</button>
								<button
									className={ `desktop-tab${engine.workspaceMode === 'registration' ? ' is-active' : ''}` }
									type="button"
									onClick={ () => actions.activatePanel( 'registration' ) }
								>
									配准
								</button>
								<button
									className={ `desktop-tab${engine.workspaceMode === 'tools' ? ' is-active' : ''}` }
									type="button"
									onClick={ () => actions.activatePanel( 'tools' ) }
								>
									工具
								</button>
								<button
									className={ `desktop-tab${engine.workspaceMode === 'inspection' ? ' is-active' : ''}` }
									type="button"
									onClick={ () => actions.activatePanel( 'inspection' ) }
								>
									核查
								</button>
							</div>
							<div className="desktop-panel__body">
								{engine.workspaceMode === 'browse' ? <BrowsePanel state={state} actions={actions} canInspect={true} /> : null}
								{engine.workspaceMode === 'registration' ? <RegistrationPanel state={state} actions={actions} /> : null}
								{engine.workspaceMode === 'tools' ? <ToolsPanel state={state} actions={actions} /> : null}
								{engine.workspaceMode === 'inspection' ? <InspectionPanel state={state} actions={actions} /> : null}
							</div>
						</aside>
					</div>
				</div>
			</>
		);
	}

	if ( state.engine.appMode === 'ar-session' ) {
		return (
			<>
				<ArCanvas canvasRef={preArCanvasRef} className="scene-host scene-host--hidden" />
				<ArCanvas canvasRef={desktopCanvasRef} className="scene-host scene-host--hidden" />
				<ArRuntimeView
					state={state}
					actions={actions}
					canvasRef={arCanvasRef}
					xrButtonRef={xrButtonRef}
				/>
			</>
		);
	}

	return (
		<>
			<ArCanvas canvasRef={arCanvasRef} className="scene-host scene-host--hidden" />
			<ArCanvas canvasRef={desktopCanvasRef} className="scene-host scene-host--hidden" />
			<PreArView
				state={state}
				actions={actions}
				canvasRef={preArCanvasRef}
				xrButtonRef={xrButtonRef}
			/>
		</>
	);

}
