import * as THREE from 'three';
import type { SetStatus } from '../shared/types.js';
import {
	clearManualRegistrationState,
	loadManualRegistrationState,
	saveManualRegistrationState,
	type SerializedManualRegistrationState
} from './manual-registration-storage.js';

export interface ManualRegistrationState {
	offset: THREE.Vector3;
	yawDeg: number;
	scaleMultiplier: number;
}

export interface ManualPlacementBase {
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	scale: number;
	scaleAnchor?: THREE.Vector3;
}

interface CreateManualRegistrationControllerOptions {
	setStatus: SetStatus;
	onStateChange: (state: ManualRegistrationState) => void;
}

export type ManualTranslationAxis = 'x' | 'y' | 'z';

const TRANSLATION_STEP_METERS = 0.1;
const YAW_STEP_DEGREES = 5;
const SCALE_STEP_FACTOR = 1.05;

const tempYawQuaternion = new THREE.Quaternion();
const tempScaleOffset = new THREE.Vector3();
const worldUpAxis = new THREE.Vector3( 0, 1, 0 );

export function createManualRegistrationController(
	options: CreateManualRegistrationControllerOptions
) {

	const { setStatus, onStateChange } = options;

	const state = createDefaultState();

	function getState(): ManualRegistrationState {

		return cloneState( state );

	}

	function adjustTranslation(axis: ManualTranslationAxis, direction: 1 | -1): ManualRegistrationState {

		state.offset[ axis ] += TRANSLATION_STEP_METERS * direction;
		emitState( `${axis.toUpperCase()} offset ${formatSignedMeters( state.offset[ axis ] )}` );
		return getState();

	}

	function adjustYaw(direction: 1 | -1): ManualRegistrationState {

		state.yawDeg = normalizeDegrees( state.yawDeg + YAW_STEP_DEGREES * direction );
		emitState( `Yaw ${formatSignedDegrees( state.yawDeg )}` );
		return getState();

	}

	function adjustScale(direction: 1 | -1): ManualRegistrationState {

		state.scaleMultiplier *= direction > 0 ? SCALE_STEP_FACTOR : 1 / SCALE_STEP_FACTOR;
		state.scaleMultiplier = clamp( state.scaleMultiplier, 0.1, 10 );
		emitState( `Scale ${state.scaleMultiplier.toFixed( 3 )}x` );
		return getState();

	}

	function reset(): ManualRegistrationState {

		state.offset.set( 0, 0, 0 );
		state.yawDeg = 0;
		state.scaleMultiplier = 1;
		emitState( 'Manual registration reset to defaults.' );
		return getState();

	}

	function save(modelId: string): boolean {

		const saved = saveManualRegistrationState( modelId, serializeState( state ) );
		if ( saved ) {
			setStatus( `Manual registration saved for ${modelId}.` );
			return true;
		}

		setStatus( 'Failed to save manual registration.' );
		return false;

	}

	function load(modelId: string): ManualRegistrationState {

		const parsed = loadManualRegistrationState( modelId );
		if ( parsed === null ) {
			state.offset.set( 0, 0, 0 );
			state.yawDeg = 0;
			state.scaleMultiplier = 1;
			emitState();
			return getState();
		}

		try {
			state.offset.set(
				toFiniteNumber( parsed.offsetX, 0 ),
				toFiniteNumber( parsed.offsetY, 0 ),
				toFiniteNumber( parsed.offsetZ, 0 )
			);
			state.yawDeg = normalizeDegrees( toFiniteNumber( parsed.yawDeg, 0 ) );
			state.scaleMultiplier = clamp( toFiniteNumber( parsed.scaleMultiplier, 1 ), 0.1, 10 );
			emitState();
		} catch {
			state.offset.set( 0, 0, 0 );
			state.yawDeg = 0;
			state.scaleMultiplier = 1;
			emitState();
		}

		return getState();

	}

	function clearSaved(modelId: string): boolean {

		const cleared = clearManualRegistrationState( modelId );
		if ( cleared ) {
			setStatus( `Saved manual registration cleared for ${modelId}.` );
			return true;
		}

		setStatus( 'Failed to clear saved manual registration.' );
		return false;

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
		adjustTranslation,
		adjustYaw,
		adjustScale,
		reset,
		save,
		load,
		clearSaved,
		applyToPlacement
	};

	function emitState(statusMessage?: string): void {

		onStateChange( getState() );

		if ( statusMessage ) {
			setStatus( `Manual registration updated: ${statusMessage}` );
		}

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

function serializeState(state: ManualRegistrationState): SerializedManualRegistrationState {

	return {
		offsetX: state.offset.x,
		offsetY: state.offset.y,
		offsetZ: state.offset.z,
		yawDeg: state.yawDeg,
		scaleMultiplier: state.scaleMultiplier
	};

}

function toFiniteNumber(value: unknown, fallback: number): number {

	return typeof value === 'number' && Number.isFinite( value ) ? value : fallback;

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

