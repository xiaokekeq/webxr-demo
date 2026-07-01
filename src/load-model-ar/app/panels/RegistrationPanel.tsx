import type React from 'react';
import type { AppActions, AppState } from '../store/ar-state.js';
import { ActionButton } from '../components/ActionButton.js';
import { SelectField } from '../components/SelectField.js';
import { PanelSection } from '../components/PanelCard.js';

const MAX_MARKER_RESULT_AGE_SECONDS = 300;

function resolveMarkerTestConfig(state: AppState): {
	configMode: 'dz1207' | 'local-debug';
	url: string;
} {

	const selectedModel = state.engine.availableModels.find(
		( item ) => item.id === state.engine.selectedModelId
	);
	const configUrl = selectedModel?.configUrl ?? '';

	if (
		state.engine.selectedModelId === 'company_debug_site'
		|| configUrl.endsWith( '/company_debug_site.config.json' )
	) {
		return {
			configMode: 'local-debug',
			url: '/marker-test/?config=local-debug'
		};
	}

	return {
		configMode: 'dz1207',
		url: '/marker-test/?config=dz1207'
	};

}

export function RegistrationPanel(props: {
	state: AppState;
	actions: AppActions;
}): React.JSX.Element {

	const { state, actions } = props;
	const engine = state.engine;
	const ui = state.ui;
	const placed = engine.arSessionPhase === 'placed' || engine.appMode === 'pre-ar';
	const canManualAdjust = placed;
	const showExportSnapshotAction = engine.appMode === 'pre-ar';
	const showInlineManualPanel = ui.registrationView === 'manual' && engine.appMode !== 'ar-session';
	const chain = engine.registrationChainDebug;
	const markerCorrectionActive = chain.arSessionLocalization.source === 'marker';
	const markerCalibration = engine.markerCalibration;
	const markerResultTooOld = ( engine.savedMarkerLocalization.ageSeconds ?? 0 ) > MAX_MARKER_RESULT_AGE_SECONDS;
	const markerTestConfig = resolveMarkerTestConfig( state );
	const canClearMarkerCorrection = engine.appMode === 'ar-session' && markerCorrectionActive;
	const canStartCurrentSessionMarkerCalibration = engine.appMode === 'ar-session' && markerCalibration.markerId !== null;
	const canCaptureCurrentSessionMarkerCorner = engine.appMode === 'ar-session' && markerCalibration.canCapture;
	const canSolveCurrentSessionMarkerCalibration = engine.appMode === 'ar-session' && markerCalibration.canSolve;

	function handleClearSavedRegistration(): void {

		if ( window.confirm( 'Clear saved registration for the current model?' ) === false ) {
			return;
		}

		actions.clearSavedRegistration();

	}

	function handleExportRegistrationSnapshot(): void {

		if ( window.confirm( 'Export the current registration snapshot JSON?' ) === false ) {
			return;
		}

		actions.exportRegistrationSnapshot();

	}

	function handleClearSavedMarkerLocalization(): void {

		if ( window.confirm( 'Clear the saved marker localization debug result?' ) === false ) {
			return;
		}

		actions.clearSavedMarkerLocalization();

	}

	function handleOpenMarkerTest(): void {

		window.location.assign( markerTestConfig.url );

	}

	return (
		<div className="panel-stack">
			<PanelSection title="Current Status" subtitle="Complete coarse placement first, then use manual adjustment to close the remaining gap.">
				<div className="summary-grid">
					<div className="summary-card">
						<strong>Status</strong>
						<span>{engine.registrationStatusDetail}</span>
					</div>
					<div className="summary-card">
						<strong>Engineering RMS</strong>
						<span>{engine.registrationMetrics.rmsText}</span>
					</div>
				</div>

				<div className="summary-grid">
					<div className="summary-card">
						<strong>AR Scale</strong>
						<span>{engine.modelScaleSummary.modeText} / unitScale {engine.modelScaleSummary.unitScaleText}</span>
					</div>
				</div>

				<p className="note-block">
					Original bounds: {engine.modelScaleSummary.originalBoundsText}<br />
					Final bounds: {engine.modelScaleSummary.finalBoundsText}<br />
					Pivot offset: {engine.modelScaleSummary.pivotOffsetText}
				</p>

				<SelectField
					label="放置方式"
					value={engine.placementMode}
					onChange={ ( value ) => actions.setPlacementMode( value as 'localized' | 'hit-test-temporary' ) }
					options={[
						{ value: 'localized', label: '按定位固定' },
						{ value: 'hit-test-temporary', label: '临时放到平面' }
					]}
				/>

				<p className="note-block">
					临时放到平面：只使用当前 hit-test 命中位置，不使用 GPS / Marker / 工程配准结果。<br />
					按定位固定：使用 hit-test 平面作为现场锚点，并叠加当前定位/配准结果完成正式放置。
				</p>

				<div className="button-row">
					<ActionButton label="Reset placement" onClick={actions.resetPlacement} kind="primary" />
					<ActionButton label="Re-run coarse registration" onClick={ () => void actions.enableCoarseRegistration() } />
					<ActionButton label="Refresh location" onClick={ () => void actions.refreshGeoLocation() } />
				</div>

				<div className="button-row">
					<ActionButton
						label="Manual adjustment"
						onClick={ () => actions.setRegistrationView( 'manual' ) }
						kind={ui.registrationView === 'manual' ? 'primary' : undefined}
						disabled={!canManualAdjust}
					/>
				</div>

				{showExportSnapshotAction ? (
					<div className="button-row button-row--compact">
						<ActionButton label="Export registration snapshot JSON" onClick={handleExportRegistrationSnapshot} kind="secondary" />
					</div>
				) : null}

				<div className="button-row">
					<ActionButton label="Save manual adjustment" onClick={actions.saveManualRegistration} kind="primary" disabled={!canManualAdjust} />
					<ActionButton label="Reset manual adjustment" onClick={actions.resetManualRegistration} kind="secondary" disabled={!canManualAdjust} />
					<ActionButton label="Clear saved registration" onClick={handleClearSavedRegistration} kind="secondary" disabled={!placed} />
				</div>
			</PanelSection>

			<PanelSection title="Registration Chain" subtitle="Read-only debug information. This section does not change current placement behavior.">
				<p className="note-block">
					Engineering control-point registration<br />
					Meaning: model local -&gt; engineering ENU<br />
					Available: {chain.engineeringControlRegistration.available ? 'yes' : 'no'}<br />
					Control point count: {chain.engineeringControlRegistration.controlPointCount}<br />
					RMS: {chain.engineeringControlRegistration.rmsText}<br />
					Uses unitScale + pivotOffset: {chain.engineeringControlRegistration.usesUnitScaleAndPivotOffset ? 'yes' : 'no'}
				</p>

				<p className="note-block">
					AR session localization<br />
					Meaning: engineering ENU -&gt; current AR local<br />
					Available: {chain.arSessionLocalization.available ? 'yes' : 'no'}<br />
					Source: {chain.arSessionLocalization.source}<br />
					siteOriginArPosition: {chain.arSessionLocalization.siteOriginArPositionText}<br />
					headingDeg: {chain.arSessionLocalization.headingDegText}
				</p>

				<p className="note-block">
					Manual AR site pose<br />
					Meaning: corrects ENU -&gt; AR local only, without modifying engineering control points<br />
					activeManualArSitePose exists: {chain.manualArSitePose.exists ? 'yes' : 'no'}<br />
					rootSiteEnu: {chain.manualArSitePose.rootSiteEnuText}<br />
					Restored: {chain.manualArSitePose.restored ? 'yes' : 'no'}
				</p>

				<p className="note-block">
					Height policy<br />
					hit-test groundY: {chain.heightPolicy.hitTestGroundYEnabled ? 'enabled' : 'disabled'}<br />
					ENU / GPS vertical offset: {chain.heightPolicy.enuGpsVerticalOffsetEnabled ? 'enabled' : 'disabled'}
				</p>

				<p className="note-block">
					Model scale summary<br />
					unitScale: {engine.modelScaleSummary.unitScaleText}<br />
					original bounds: {engine.modelScaleSummary.originalBoundsText}<br />
					final bounds: {engine.modelScaleSummary.finalBoundsText}<br />
					pivot offset: {engine.modelScaleSummary.pivotOffsetText}
				</p>

				<p className="note-block">
					Marker localization config<br />
					marker count: {chain.markerEngineering.markerCount}
				</p>
				{chain.markerEngineering.markers.map( ( marker ) => (
					<p className="note-block" key={marker.markerId}>
						marker id: {marker.markerId}<br />
						bindControlPointId: {marker.bindControlPointId}<br />
						sizeMeters: {marker.sizeMetersText}<br />
						markerPoseInEnu resolved: {marker.resolved ? 'yes' : 'no'}
					</p>
				) )}
			</PanelSection>

			<PanelSection title="Current Session Marker" subtitle="正式 Marker 校正只在当前 WebXR ARSession 内完成，不再跨页面复用旧的 AR local。">
				<p className="note-block">
					currentArSessionId: {markerCalibration.currentSessionId ?? '-'}<br />
					markerId: {markerCalibration.markerId ?? '-'}<br />
					corners: {markerCalibration.capturedCornerCount} / {markerCalibration.expectedCornerCount}<br />
					next corner: {markerCalibration.capturedCornerCount >= markerCalibration.expectedCornerCount
						? '已完成'
						: markerCalibration.nextCornerLabel}<br />
					rmsErrorMeters: {markerCalibration.rmsErrorMeters?.toFixed( 6 ) ?? '-'}<br />
					headingDeg: {markerCalibration.headingDeg?.toFixed( 4 ) ?? '-'}<br />
					applied: {markerCalibration.applied ? 'yes' : 'no'}
				</p>

				<p className="note-block">
					Marker 校正修正的是 ENU -&gt; AR local，不修改工程控制点配准。
				</p>

				{markerCalibration.corners.length > 0 ? (
					<p className="note-block">
						{markerCalibration.corners.map( ( corner ) => `${corner.label}: ${corner.positionText}` ).join( '\n' )}
					</p>
				) : (
					<p className="note-block">
						请在当前 AR 会话里，用 reticle 依次对准 marker 的左上角、右上角、右下角、左下角，再逐个采集。
					</p>
				)}

				<div className="button-row">
					<ActionButton
						label="开始当前会话 Marker 校正"
						onClick={actions.startCurrentSessionMarkerCalibration}
						kind={markerCalibration.active ? 'secondary' : 'primary'}
						disabled={!canStartCurrentSessionMarkerCalibration}
					/>
					<ActionButton
						label="采集当前角点"
						onClick={actions.captureCurrentSessionMarkerCorner}
						kind="secondary"
						disabled={!canCaptureCurrentSessionMarkerCorner}
					/>
				</div>

				<div className="button-row">
					<ActionButton
						label="求解并应用 Marker 校正"
						onClick={actions.solveAndApplyCurrentSessionMarkerCalibration}
						kind="primary"
						disabled={!canSolveCurrentSessionMarkerCalibration}
					/>
					<ActionButton
						label="重置当前角点"
						onClick={actions.resetCurrentSessionMarkerCalibration}
						kind="secondary"
						disabled={engine.appMode !== 'ar-session'}
					/>
					<ActionButton
						label="清除 Marker 校正"
						onClick={actions.clearMarkerLocalizationCorrection}
						kind="secondary"
						disabled={!canClearMarkerCorrection}
					/>
				</div>
			</PanelSection>

			<PanelSection title="Marker Debug Result" subtitle="`/marker-test/` 结果现在仅保留为调试信息，不再作为正式 Apply 来源。">
				<p className="note-block">
					Available: {engine.savedMarkerLocalization.available ? 'yes' : 'no'}<br />
					markerId: {engine.savedMarkerLocalization.markerId ?? '-'}<br />
					markerConfigId: {engine.savedMarkerLocalization.markerConfigId ?? '-'}<br />
					timestamp: {engine.savedMarkerLocalization.timestamp ?? '-'}<br />
					ageSeconds: {engine.savedMarkerLocalization.ageSeconds ?? '-'}<br />
					rmsErrorMeters: {engine.savedMarkerLocalization.rmsErrorMeters?.toFixed( 6 ) ?? '-'}<br />
					sampleCount: {engine.savedMarkerLocalization.sampleCount ?? '-'}<br />
					headingDeg: {engine.savedMarkerLocalization.headingDeg?.toFixed( 4 ) ?? '-'}<br />
					siteOriginArPosition: {engine.savedMarkerLocalization.siteOriginArPosition === undefined
						? '-'
						: `${engine.savedMarkerLocalization.siteOriginArPosition.x.toFixed( 4 )}, ${engine.savedMarkerLocalization.siteOriginArPosition.y.toFixed( 4 )}, ${engine.savedMarkerLocalization.siteOriginArPosition.z.toFixed( 4 )}`}<br />
					stable: {engine.savedMarkerLocalization.stable === undefined
						? '-'
						: engine.savedMarkerLocalization.stable ? 'stable' : 'unstable'}
				</p>

				<p className="note-block">
					`/marker-test/` 现在是调试页。它保存的 localStorage 结果不会直接作为正式 Marker 校正应用到新的 ARSession。
				</p>

				<p className="note-block">
					Marker 校正修正的是 ENU -&gt; AR local，不修改工程控制点配准。<br />
					Current localization source: {chain.arSessionLocalization.source}
				</p>

				{markerResultTooOld ? (
					<p className="note-block">
						Warning: the saved marker result is older than {MAX_MARKER_RESULT_AGE_SECONDS}s. Refresh `/marker-test/` only for debug inspection.
					</p>
				) : null}

				<p className="note-block">
					marker-test configMode: {markerTestConfig.configMode}
				</p>

				<div className="button-row">
					<ActionButton label="Open marker test (debug only)" onClick={handleOpenMarkerTest} kind="secondary" />
					<ActionButton label="Refresh marker result" onClick={actions.refreshSavedMarkerLocalization} kind="secondary" />
					<ActionButton label="Clear marker result" onClick={handleClearSavedMarkerLocalization} kind="secondary" />
				</div>
			</PanelSection>

			{showInlineManualPanel ? (
				<PanelSection title="Manual Adjustment" subtitle="After placement, you can fine-tune translation, yaw, and scale here.">
					<SelectField
						label="Adjustment preset"
						value={engine.manualAdjustmentPreset}
						onChange={ ( value ) => actions.setManualAdjustmentPreset( value as 'fine' | 'medium' | 'coarse' ) }
						options={[
							{ value: 'fine', label: 'Fine: 0.02m / 1deg / 1.01x' },
							{ value: 'medium', label: 'Medium: 0.10m / 5deg / 1.05x' },
							{ value: 'coarse', label: 'Coarse: 0.30m / 15deg / 1.10x' }
						]}
					/>

					<div className="manual-grid">
						<ActionButton label="Forward" onClick={ () => actions.adjustTranslation( 'z', -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Left" onClick={ () => actions.adjustTranslation( 'x', -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Up" onClick={ () => actions.adjustTranslation( 'y', 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Right" onClick={ () => actions.adjustTranslation( 'x', 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Back" onClick={ () => actions.adjustTranslation( 'z', 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Down" onClick={ () => actions.adjustTranslation( 'y', -1 ) } disabled={!canManualAdjust} />
					</div>

					<div className="button-row">
						<ActionButton label="Rotate left" onClick={ () => actions.adjustYaw( -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Rotate right" onClick={ () => actions.adjustYaw( 1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Scale down" onClick={ () => actions.adjustScale( -1 ) } disabled={!canManualAdjust} />
						<ActionButton label="Scale up" onClick={ () => actions.adjustScale( 1 ) } disabled={!canManualAdjust} />
					</div>

					<p className="note-block">
						Position: {engine.manualReadout.positionText}<br />
						Yaw: {engine.manualReadout.yawText}<br />
						Scale: {engine.manualReadout.scaleText}
					</p>

					{canManualAdjust ? (
						<p className="note-block">Use coarse steps first to pull the model close, then switch to fine steps to close the gap.</p>
					) : (
						<p className="note-block">Place the model first, then come back for manual adjustment.</p>
					)}
				</PanelSection>
			) : null}
		</div>
	);

}
