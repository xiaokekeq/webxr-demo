import * as THREE from 'three';
import {
	createDefaultMeasurementState,
	type MeasurementMode,
	type PrecisionFeedbackTone,
	type RegistrationStore
} from '../../../registration/registration-store.js';
import { createMeasurementVisuals } from './measurement-visuals.js';
import {
	computeMeasurementResult,
	getMeasurementModeDescription,
	getMeasurementModeLabel
} from './measurement-types.js';
import type { XRHitTestQuality } from '../../../shared/types.js';

interface CreateMeasurementControllerOptions {
	store: RegistrationStore;
	scene: THREE.Scene;
	setStatus(message: string): void;
	getTargetPoint(target: THREE.Vector3): THREE.Vector3 | null;
	getTargetPointQuality?(): XRHitTestQuality | null;
}

export interface MeasurementController {
	start(mode: MeasurementMode): void;
	confirmPoint(): void;
	cancel(): void;
	clear(): void;
	reset(): void;
	dispose(): void;
}

const REQUIRED_POINT_COUNT = 2;
const MIN_TARGET_SAMPLE_COUNT = 6;
const MAX_TARGET_JITTER_METERS = 0.025;
const tempTargetPoint = new THREE.Vector3();

export function createMeasurementController(
	options: CreateMeasurementControllerOptions
): MeasurementController {

	const {
		store,
		scene,
		setStatus,
		getTargetPoint,
		getTargetPointQuality
	} = options;

	const visuals = createMeasurementVisuals( { scene } );
	const points: THREE.Vector3[] = [];

	return {
		start(mode) {

			points.length = 0;
			visuals.clear();
			const label = getMeasurementModeLabel( mode );
			const description = getMeasurementModeDescription( mode );
			const message = `已进入${label}，请确认第 1 个测点。`;

			store.patch( {
				measurement: {
					...createDefaultMeasurementState(),
					activeMode: mode,
					activeLabel: label,
					isCapturing: true,
					requiredPointCount: REQUIRED_POINT_COUNT,
					detailText: description,
					feedbackText: message,
					feedbackTone: 'info',
					feedbackUpdatedAt: createFeedbackTimestamp()
				}
			} );
			setStatus( message );

		},

		confirmPoint() {

			const measurement = store.getState().measurement;
			if ( measurement.activeMode === null ) {
				const message = '请先选择一种测量模式。';
				patchMeasurementState( {}, message, 'error' );
				setStatus( message );
				return;
			}

			const targetPoint = getTargetPoint( tempTargetPoint );
			if ( targetPoint === null ) {
				const message = '当前没有可用测点，请先对准已识别的平面。';
				patchMeasurementState( {}, message, 'error' );
				setStatus( message );
				return;
			}

			const targetQuality = getTargetPointQuality?.() ?? null;
			if ( targetQuality !== null && targetQuality.sampleCount < MIN_TARGET_SAMPLE_COUNT ) {
				const message = `当前测点采样不足，当前 ${targetQuality.sampleCount} 帧，至少需要 ${MIN_TARGET_SAMPLE_COUNT} 帧。`;
				patchMeasurementState( {
					targetQualityText: formatQualityLabel( targetQuality )
				}, message, 'error' );
				setStatus( message );
				return;
			}

			if ( targetQuality !== null && targetQuality.jitterMeters > MAX_TARGET_JITTER_METERS ) {
				const message = `当前测点抖动偏大（${formatMeters( targetQuality.jitterMeters )}），请稳住设备后再确认。`;
				patchMeasurementState( {
					targetQualityText: formatQualityLabel( targetQuality )
				}, message, 'error' );
				setStatus( message );
				return;
			}

			points.push( targetPoint.clone() );
			visuals.update( measurement.activeMode, points );

			const pointLabel = formatVectorLabel( targetPoint );
			const nextPointIndex = points.length + 1;
			const targetQualityText = formatQualityLabel( targetQuality );

			if ( points.length < REQUIRED_POINT_COUNT ) {
				const message = `已记录第 ${points.length} 个测点，请确认第 ${nextPointIndex} 个测点。`;
				patchMeasurementState( {
					capturedPointLabels: points.map( formatVectorLabel ),
					targetQualityText
				}, message, 'info' );
				setStatus( `${measurement.activeLabel}已记录测点 ${pointLabel}。` );
				return;
			}

			const result = computeMeasurementResult( measurement.activeMode, points );
			const message = `${measurement.activeLabel}完成，结果 ${result.resultText}。`;
			patchMeasurementState( {
				capturedPointLabels: points.map( formatVectorLabel ),
				targetQualityText,
				isCapturing: false,
				resultText: result.resultText,
				detailText: result.detailText
			}, message, 'success' );
			setStatus( message );

		},

		cancel() {

			points.length = 0;
			visuals.clear();
			store.patch( {
				measurement: {
					...createDefaultMeasurementState(),
					feedbackText: '已取消当前测量。',
					feedbackTone: 'info',
					feedbackUpdatedAt: createFeedbackTimestamp()
				}
			} );
			setStatus( '已取消当前测量。' );

		},

		clear() {

			points.length = 0;
			visuals.clear();
			store.patch( {
				measurement: {
					...createDefaultMeasurementState(),
					feedbackText: '已清除当前测量结果。',
					feedbackTone: 'info',
					feedbackUpdatedAt: createFeedbackTimestamp()
				}
			} );
			setStatus( '已清除当前测量结果。' );

		},

		reset() {

			points.length = 0;
			visuals.clear();
			store.patch( {
				measurement: createDefaultMeasurementState()
			} );

		},

		dispose() {

			points.length = 0;
			visuals.dispose();

		}
	};

	function patchMeasurementState(
		partialState: Partial<ReturnType<typeof createDefaultMeasurementState>>,
		feedbackText?: string,
		feedbackTone?: PrecisionFeedbackTone
	): void {

		store.patch( {
			measurement: {
				...store.getState().measurement,
				...partialState,
				feedbackText: feedbackText ?? store.getState().measurement.feedbackText,
				feedbackTone: feedbackTone ?? store.getState().measurement.feedbackTone,
				feedbackUpdatedAt: feedbackText === undefined && feedbackTone === undefined
					? store.getState().measurement.feedbackUpdatedAt
					: createFeedbackTimestamp()
			}
		} );

	}

}

function formatVectorLabel(vector: THREE.Vector3): string {

	return `(${vector.x.toFixed( 2 )}, ${vector.y.toFixed( 2 )}, ${vector.z.toFixed( 2 )})`;

}

function formatMeters(value: number): string {

	return `${value.toFixed( 3 )}m`;

}

function formatQualityLabel(quality: XRHitTestQuality | null): string {

	if ( quality === null ) {
		return '尚未采样';
	}

	return `${quality.sampleCount} 帧 / 抖动 ${formatMeters( quality.jitterMeters )}`;

}

function createFeedbackTimestamp(): string {

	return new Date().toLocaleTimeString( 'zh-CN', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	} );

}
