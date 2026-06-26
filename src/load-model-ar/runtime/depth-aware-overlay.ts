import * as THREE from 'three';
import type { DepthSensingMode } from '../registration/registration-store.js';

export type DepthAwareOverlayKind = 'xray' | 'wireframe';

interface DepthAwareOverlayRuntimeOptions {
	renderer: THREE.WebGLRenderer;
}

interface OverlaySnapshot {
	active: boolean;
	gpuDepthActive: boolean;
	cpuDepthActive: boolean;
	depthTexture: THREE.Texture | null;
	cpuDepthTexture: THREE.DataTexture | null;
	viewportWidth: number;
	viewportHeight: number;
	cpuDepthMeters: number | null;
	depthUsage: 'cpu-optimized' | 'gpu-optimized' | 'unknown';
	featureGranted: boolean;
}

interface XRSessionWithDepthMetadata extends XRSession {
	enabledFeatures?: string[];
	depthUsage?: 'cpu-optimized' | 'gpu-optimized';
}

interface XRCPUDepthInformationLike {
	width: number;
	height: number;
	getDepthInMeters(x: number, y: number): number;
}

interface XRFrameWithDepthInformation extends XRFrame {
	getDepthInformation?(view: XRView): XRCPUDepthInformationLike | null;
}

interface CpuDepthTextureState {
	texture: THREE.DataTexture | null;
	centerMeters: number | null;
	active: boolean;
}

const XRAY_COLOR = new THREE.Color( 0x6ce7ff );
const XRAY_OPACITY = 0.34;
const WIREFRAME_COLOR = new THREE.Color( 0x8be9ff );
const WIREFRAME_OPACITY = 0.96;
const GPU_DEPTH_COMPARE_BIAS = 0.00035;
const CPU_DEPTH_COMPARE_BIAS_METERS = 0.08;
const MAX_CPU_DEPTH_TEXTURE_WIDTH = 128;

const OVERLAY_VERTEX_SHADER = `
in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out float vViewDepthMeters;

void main() {

	vec4 modelViewPosition = modelViewMatrix * vec4( position, 1.0 );
	vViewDepthMeters = -modelViewPosition.z;
	gl_Position = projectionMatrix * modelViewPosition;

}
`;

const OVERLAY_FRAGMENT_SHADER = `
precision highp float;
precision highp sampler2D;
precision highp sampler2DArray;

uniform sampler2DArray uGpuDepthTexture;
uniform sampler2D uCpuDepthTexture;
uniform bool uUseGpuDepth;
uniform bool uUseCpuDepth;
uniform float uDepthWidth;
uniform float uDepthHeight;
uniform vec3 uTintColor;
uniform float uTintOpacity;
uniform float uGpuDepthBias;
uniform float uCpuDepthBiasMeters;

in float vViewDepthMeters;

out vec4 outColor;

vec2 getViewUv() {

	return vec2(
		gl_FragCoord.x / max( uDepthWidth, 1.0 ),
		gl_FragCoord.y / max( uDepthHeight, 1.0 )
	);

}

float sampleGpuDepth(vec2 viewUv) {

	if ( viewUv.x >= 1.0 ) {
		return texture( uGpuDepthTexture, vec3( viewUv.x - 1.0, viewUv.y, 1.0 ) ).r;
	}

	return texture( uGpuDepthTexture, vec3( viewUv.x, viewUv.y, 0.0 ) ).r;

}

float sampleCpuDepthMeters(vec2 viewUv) {

	return texture( uCpuDepthTexture, viewUv ).r;

}

void main() {

	vec2 viewUv = getViewUv();

	if ( uUseGpuDepth ) {
		float realDepth = sampleGpuDepth( viewUv );
		bool occludedByReality = gl_FragCoord.z > realDepth + uGpuDepthBias;
		if ( occludedByReality == false ) {
			discard;
		}
	} else if ( uUseCpuDepth ) {
		float realDepthMeters = sampleCpuDepthMeters( viewUv );
		bool hasRealDepth = realDepthMeters > 0.0;
		bool occludedByReality = hasRealDepth && ( vViewDepthMeters > realDepthMeters + uCpuDepthBiasMeters );
		if ( occludedByReality == false ) {
			discard;
		}
	} else {
		discard;
	}

	outColor = vec4( uTintColor, uTintOpacity );

}
`;

export interface DepthAwareOverlayRuntime {
	update(frame?: XRFrame): boolean;
	isActive(): boolean;
	setDepthSensingMode(mode: DepthSensingMode): void;
	getMaterial(kind: DepthAwareOverlayKind): THREE.ShaderMaterial;
	dispose(): void;
}

export function createDepthAwareOverlayRuntime(
	options: DepthAwareOverlayRuntimeOptions
): DepthAwareOverlayRuntime {

	const { renderer } = options;
	const materials = new Map<DepthAwareOverlayKind, THREE.ShaderMaterial>();
	let cpuDepthTextureData: Float32Array | null = null;
	let cpuDepthTexture: THREE.DataTexture | null = null;
	let depthSensingMode: DepthSensingMode = 'disabled';
	let snapshot: OverlaySnapshot = {
		active: false,
		gpuDepthActive: false,
		cpuDepthActive: false,
		depthTexture: null,
		cpuDepthTexture: null,
		viewportWidth: 1,
		viewportHeight: 1,
		cpuDepthMeters: null,
		depthUsage: 'unknown',
		featureGranted: false
	};

	function update(frame?: XRFrame): boolean {

		const session = renderer.xr.getSession() as XRSessionWithDepthMetadata | null;
		const depthTexture = renderer.xr.getDepthTexture();
		const cameraXR = renderer.xr.getCamera();
		const viewport = cameraXR.cameras[ 0 ]?.viewport;
		const featureGranted = session?.enabledFeatures?.includes( 'depth-sensing' ) ?? false;
		const depthUsage = session?.depthUsage ?? 'unknown';
		const cpuDepthState = shouldUseCpuDepthMode( depthSensingMode )
			? updateCpuDepthTexture( renderer, frame )
			: {
				texture: cpuDepthTexture,
				centerMeters: null,
				active: false
			};
		const gpuDepthSupported = renderer.xr.isPresenting
			&& renderer.capabilities.isWebGL2
			&& renderer.xr.hasDepthSensing()
			&& depthTexture !== null
			&& viewport !== undefined;
		const gpuDepthActive = shouldUseGpuDepthMode( depthSensingMode )
			&& gpuDepthSupported;
		const cpuDepthActive = shouldUseCpuDepthMode( depthSensingMode )
			&& renderer.xr.isPresenting
			&& viewport !== undefined
			&& cpuDepthState.active;

		snapshot = {
			active: gpuDepthActive || cpuDepthActive,
			gpuDepthActive,
			cpuDepthActive,
			depthTexture,
			cpuDepthTexture: cpuDepthState.texture,
			viewportWidth: viewport?.z ?? 1,
			viewportHeight: viewport?.w ?? 1,
			cpuDepthMeters: cpuDepthState.centerMeters,
			depthUsage,
			featureGranted
		};

		for ( const material of materials.values() ) {
			material.uniforms.uUseGpuDepth.value = gpuDepthActive;
			material.uniforms.uUseCpuDepth.value = gpuDepthActive === false && cpuDepthActive;
			material.uniforms.uGpuDepthTexture.value = depthTexture;
			material.uniforms.uCpuDepthTexture.value = cpuDepthState.texture;
			material.uniforms.uDepthWidth.value = snapshot.viewportWidth;
			material.uniforms.uDepthHeight.value = snapshot.viewportHeight;
		}

		return snapshot.active;

	}

	function isActive(): boolean {

		return snapshot.active;

	}

	function setDepthSensingMode(mode: DepthSensingMode): void {

		depthSensingMode = mode;

	}

	function getMaterial(kind: DepthAwareOverlayKind): THREE.ShaderMaterial {

		const existingMaterial = materials.get( kind );
		if ( existingMaterial !== undefined ) {
			return existingMaterial;
		}

		const material = new THREE.ShaderMaterial( {
			name: kind === 'xray' ? '__depth-aware-xray' : '__depth-aware-wireframe',
			vertexShader: OVERLAY_VERTEX_SHADER,
			fragmentShader: OVERLAY_FRAGMENT_SHADER,
			glslVersion: THREE.GLSL3,
			wireframe: kind === 'wireframe',
			transparent: true,
			depthTest: false,
			depthWrite: false,
			toneMapped: false,
			side: THREE.DoubleSide,
			uniforms: {
				uGpuDepthTexture: { value: snapshot.depthTexture },
				uCpuDepthTexture: { value: snapshot.cpuDepthTexture },
				uUseGpuDepth: { value: snapshot.gpuDepthActive },
				uUseCpuDepth: { value: snapshot.cpuDepthActive },
				uDepthWidth: { value: snapshot.viewportWidth },
				uDepthHeight: { value: snapshot.viewportHeight },
				uTintColor: {
					value: kind === 'xray' ? XRAY_COLOR.clone() : WIREFRAME_COLOR.clone()
				},
				uTintOpacity: {
					value: kind === 'xray' ? XRAY_OPACITY : WIREFRAME_OPACITY
				},
				uGpuDepthBias: { value: GPU_DEPTH_COMPARE_BIAS },
				uCpuDepthBiasMeters: { value: CPU_DEPTH_COMPARE_BIAS_METERS }
			}
		} );

		materials.set( kind, material );
		return material;

	}

	function dispose(): void {

		for ( const material of materials.values() ) {
			material.dispose();
		}

		materials.clear();
		cpuDepthTextureData = null;
		cpuDepthTexture?.dispose();
		cpuDepthTexture = null;

	}

	return {
		update,
		isActive,
		setDepthSensingMode,
		getMaterial,
		dispose
	};

	function updateCpuDepthTexture(
		rendererInstance: THREE.WebGLRenderer,
		frame?: XRFrame
	): CpuDepthTextureState {

		const depthInfo = readCpuDepthInformation( rendererInstance, frame );
		if ( depthInfo === null ) {
			return {
				texture: cpuDepthTexture,
				centerMeters: null,
				active: false
			};
		}

		const sampleWidth = Math.max( 1, Math.min( depthInfo.width, MAX_CPU_DEPTH_TEXTURE_WIDTH ) );
		const sampleHeight = Math.max(
			1,
			Math.round( depthInfo.height * ( sampleWidth / Math.max( depthInfo.width, 1 ) ) )
		);
		const pixelCount = sampleWidth * sampleHeight;

		if ( cpuDepthTextureData === null || cpuDepthTextureData.length !== pixelCount ) {
			cpuDepthTextureData = new Float32Array( pixelCount );
			cpuDepthTexture?.dispose();
			cpuDepthTexture = new THREE.DataTexture(
				cpuDepthTextureData,
				sampleWidth,
				sampleHeight,
				THREE.RedFormat,
				THREE.FloatType
			);
			cpuDepthTexture.magFilter = THREE.NearestFilter;
			cpuDepthTexture.minFilter = THREE.NearestFilter;
			cpuDepthTexture.generateMipmaps = false;
			cpuDepthTexture.flipY = false;
			cpuDepthTexture.unpackAlignment = 1;
			cpuDepthTexture.needsUpdate = true;
		} else if ( cpuDepthTexture !== null ) {
			cpuDepthTexture.image.width = sampleWidth;
			cpuDepthTexture.image.height = sampleHeight;
		}

		for ( let y = 0; y < sampleHeight; y += 1 ) {
			const normalizedY = ( y + 0.5 ) / sampleHeight;
			for ( let x = 0; x < sampleWidth; x += 1 ) {
				const normalizedX = ( x + 0.5 ) / sampleWidth;
				const depthMeters = depthInfo.getDepthInMeters( normalizedX, normalizedY );
				cpuDepthTextureData[ y * sampleWidth + x ] = Number.isFinite( depthMeters )
					? depthMeters
					: 0;
			}
		}

		if ( cpuDepthTexture !== null ) {
			cpuDepthTexture.needsUpdate = true;
		}

		const centerMeters = depthInfo.getDepthInMeters( 0.5, 0.5 );
		return {
			texture: cpuDepthTexture,
			centerMeters: Number.isFinite( centerMeters ) ? centerMeters : null,
			active: cpuDepthTexture !== null
		};

	}

}

function shouldUseGpuDepthMode(mode: DepthSensingMode): boolean {

	return mode === 'gpu' || mode === 'auto';

}

function shouldUseCpuDepthMode(mode: DepthSensingMode): boolean {

	return mode === 'cpu' || mode === 'auto';

}

function readCpuDepthInformation(
	renderer: THREE.WebGLRenderer,
	frame?: XRFrame
): XRCPUDepthInformationLike | null {

	if ( frame === undefined ) {
		return null;
	}

	const depthFrame = frame as XRFrameWithDepthInformation;
	if ( typeof depthFrame.getDepthInformation !== 'function' ) {
		return null;
	}

	const referenceSpace = renderer.xr.getReferenceSpace();
	if ( referenceSpace === null ) {
		return null;
	}

	const pose = frame.getViewerPose( referenceSpace );
	const firstView = pose?.views[ 0 ];
	if ( firstView === undefined ) {
		return null;
	}

	try {
		const depthInfo = depthFrame.getDepthInformation( firstView );
		return depthInfo ?? null;
	} catch {
		return null;
	}

}
