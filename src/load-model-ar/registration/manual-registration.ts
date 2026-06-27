import * as THREE from 'three';
import type { SetStatus } from '../shared/types.js';

export interface ManualRegistrationState {
	offset: THREE.Vector3;
	yawDeg: number;
	scaleMultiplier: number;
}

export type ManualAdjustmentPreset = 'fine' | 'medium' | 'coarse';

export interface ManualPlacementBase {
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	scale: number;
	scaleAnchor?: THREE.Vector3;
	siteContext?: {
		siteOriginArPosition: THREE.Vector3;
		headingDeg: number;
		baseScale: number;
	};
}

interface CreateManualRegistrationControllerOptions {
	setStatus: SetStatus;
	onStateChange: (state: ManualRegistrationState) => void;
	onPresetChange?: (preset: ManualAdjustmentPreset) => void;
}

export type ManualTranslationAxis = 'x' | 'y' | 'z';

const MANUAL_ADJUSTMENT_STEPS: Record<ManualAdjustmentPreset, {
	translationMeters: number;
	yawDegrees: number;
	scaleFactor: number;
}> = {
	fine: {
		translationMeters: 0.02,
		yawDegrees: 1,
		scaleFactor: 1.01
	},
	medium: {
		translationMeters: 0.1,
		yawDegrees: 5,
		scaleFactor: 1.05
	},
	coarse: {
		translationMeters: 0.3,
		yawDegrees: 15,
		scaleFactor: 1.1
	}
};

const tempYawQuaternion = new THREE.Quaternion();
const tempScaleOffset = new THREE.Vector3();
const worldUpAxis = new THREE.Vector3( 0, 1, 0 );

export function createManualRegistrationController(
	options: CreateManualRegistrationControllerOptions
) {

	const { setStatus, onStateChange, onPresetChange } = options;

	const state = createDefaultState();
	let adjustmentPreset: ManualAdjustmentPreset = 'fine';

	function getState(): ManualRegistrationState {

		return cloneState( state );

	}

	function setState(
		nextState: ManualRegistrationState,
		options?: { silent?: boolean; statusMessage?: string }
	): ManualRegistrationState {

		state.offset.copy( nextState.offset );
		state.yawDeg = normalizeDegrees( nextState.yawDeg );
		state.scaleMultiplier = clamp( nextState.scaleMultiplier, 0.1, 10 );
		emitState( options?.silent ? undefined : options?.statusMessage );
		return getState();

	}

	function adjustTranslation(axis: ManualTranslationAxis, direction: 1 | -1): ManualRegistrationState {

		state.offset[ axis ] += getCurrentStepConfig().translationMeters * direction;
		emitState( `${axis.toUpperCase()} offset ${formatSignedMeters( state.offset[ axis ] )}` );
		return getState();

	}

	function adjustYaw(direction: 1 | -1): ManualRegistrationState {

		state.yawDeg = normalizeDegrees( state.yawDeg + getCurrentStepConfig().yawDegrees * direction );
		emitState( `Yaw ${formatSignedDegrees( state.yawDeg )}` );
		return getState();

	}

	function adjustScale(direction: 1 | -1): ManualRegistrationState {

		const stepConfig = getCurrentStepConfig();
		state.scaleMultiplier *= direction > 0 ? stepConfig.scaleFactor : 1 / stepConfig.scaleFactor;
		state.scaleMultiplier = clamp( state.scaleMultiplier, 0.1, 10 );
		emitState( `Scale ${state.scaleMultiplier.toFixed( 3 )}x` );
		return getState();

	}

	function setAdjustmentPreset(preset: ManualAdjustmentPreset): void {

		adjustmentPreset = preset;
		onPresetChange?.( preset );
		setStatus( `微调强度已切换为${getPresetLabel( preset )}。` );

	}

	function getAdjustmentPreset(): ManualAdjustmentPreset {

		return adjustmentPreset;

	}

	function reset(): ManualRegistrationState {

		return setState( createDefaultState(), {
			statusMessage: 'Manual registration reset to defaults.'
		} );

	}

	function hasAdjustments(): boolean {

		return state.offset.lengthSq() > 1e-10
			|| Math.abs( state.yawDeg ) > 1e-6
			|| Math.abs( state.scaleMultiplier - 1 ) > 1e-6;

	}

	function applyToPlacement(
		base: ManualPlacementBase,
		targetPosition = new THREE.Vector3(),
		targetOrientation = new THREE.Quaternion()
	): {
		position: THREE.Vector3;
		orientation: THREE.Quaternion;
		scale: number;
	} {

		if ( base.scaleAnchor !== undefined ) {
			targetPosition
				.copy( base.scaleAnchor )
				.add(
					tempScaleOffset
						.copy( base.position )
						.sub( base.scaleAnchor )
						.multiplyScalar( state.scaleMultiplier )
				)
				.add( state.offset );
		} else {
			targetPosition.copy( base.position ).add( state.offset );
		}

		tempYawQuaternion.setFromAxisAngle(
			worldUpAxis,
			THREE.MathUtils.degToRad( state.yawDeg )
		);
		targetOrientation.copy( base.orientation ).multiply( tempYawQuaternion );

		return {
			position: targetPosition,
			orientation: targetOrientation,
			scale: base.scale * state.scaleMultiplier
		};

	}

	return {
		getState,
		setState,
		adjustTranslation,
		adjustYaw,
		adjustScale,
		setAdjustmentPreset,
		getAdjustmentPreset,
		reset,
		hasAdjustments,
		applyToPlacement
	};

	function emitState(statusMessage?: string): void {

		onStateChange( getState() );

		if ( statusMessage ) {
			setStatus( `Manual registration updated: ${statusMessage}` );
		}

	}

	function getCurrentStepConfig(): typeof MANUAL_ADJUSTMENT_STEPS.fine {

		return MANUAL_ADJUSTMENT_STEPS[ adjustmentPreset ];

	}

}

function createDefaultState(): ManualRegistrationState {

	return {
		offset: new THREE.Vector3(),
		yawDeg: 0,
		scaleMultiplier: 1
	};

}

function cloneState(state: ManualRegistrationState): ManualRegistrationState {

	return {
		offset: state.offset.clone(),
		yawDeg: state.yawDeg,
		scaleMultiplier: state.scaleMultiplier
	};

}
function formatSignedMeters(value: number): string {

	return `${value >= 0 ? '+' : ''}${value.toFixed( 2 )}m`;

}

function formatSignedDegrees(value: number): string {

	const signedValue = value > 180 ? value - 360 : value;
	return `${signedValue >= 0 ? '+' : ''}${signedValue.toFixed( 0 )}deg`;

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}

function clamp(value: number, min: number, max: number): number {

	return Math.min( Math.max( value, min ), max );

}

function getPresetLabel(preset: ManualAdjustmentPreset): string {

	switch ( preset ) {
		case 'fine':
			return '细调';
		case 'medium':
			return '中调';
		case 'coarse':
			return '粗调';
	}

}
