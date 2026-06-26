import * as THREE from 'three';
import type { DepthDebugState } from '../registration/registration-store.js';

export type DepthAwareOverlayKind = 'xray' | 'wireframe';

interface DepthAwareOverlayRuntimeOptions {
	renderer: THREE.WebGLRenderer;
}

interface OverlaySnapshot {
	active: boolean;
	depthTexture: THREE.Texture | null;
	viewportWidth: number;
	viewportHeight: number;
}

const XRAY_COLOR = new THREE.Color( 0x6ce7ff );
const XRAY_OPACITY = 0.34;
const WIREFRAME_COLOR = new THREE.Color( 0x8be9ff );
const WIREFRAME_OPACITY = 0.96;
const DEPTH_COMPARE_BIAS = 0.00035;

const OVERLAY_VERTEX_SHADER = `
in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {

	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}
`;

const OVERLAY_FRAGMENT_SHADER = `
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uDepthTexture;
uniform bool uHasDepthSensing;
uniform float uDepthWidth;
uniform float uDepthHeight;
uniform vec3 uTintColor;
uniform float uTintOpacity;
uniform float uDepthBias;

out vec4 outColor;

float sampleRealDepth() {

	vec2 coord = vec2(
		gl_FragCoord.x / max( uDepthWidth, 1.0 ),
		gl_FragCoord.y / max( uDepthHeight, 1.0 )
	);

	if ( coord.x >= 1.0 ) {
		return texture( uDepthTexture, vec3( coord.x - 1.0, coord.y, 1.0 ) ).r;
	}

	return texture( uDepthTexture, vec3( coord.x, coord.y, 0.0 ) ).r;

}

void main() {

	if ( uHasDepthSensing ) {
		float realDepth = sampleRealDepth();
		bool occludedByReality = gl_FragCoord.z > realDepth + uDepthBias;
		if ( occludedByReality == false ) {
			discard;
		}
	}

	outColor = vec4( uTintColor, uTintOpacity );

}
`;

export interface DepthAwareOverlayRuntime {
	update(): boolean;
	isActive(): boolean;
	getDebugState(): DepthDebugState;
	getMaterial(kind: DepthAwareOverlayKind): THREE.ShaderMaterial;
	dispose(): void;
}

export function createDepthAwareOverlayRuntime(
	options: DepthAwareOverlayRuntimeOptions
): DepthAwareOverlayRuntime {

	const { renderer } = options;
	const materials = new Map<DepthAwareOverlayKind, THREE.ShaderMaterial>();
	let snapshot: OverlaySnapshot = {
		active: false,
		depthTexture: null,
		viewportWidth: 1,
		viewportHeight: 1
	};

	function update(): boolean {

		const depthTexture = renderer.xr.getDepthTexture();
		const cameraXR = renderer.xr.getCamera();
		const viewport = cameraXR.cameras[ 0 ]?.viewport;
		const active = renderer.xr.isPresenting
			&& renderer.capabilities.isWebGL2
			&& renderer.xr.hasDepthSensing()
			&& depthTexture !== null
			&& viewport !== undefined;

		snapshot = {
			active,
			depthTexture,
			viewportWidth: viewport?.z ?? 1,
			viewportHeight: viewport?.w ?? 1
		};

		for ( const material of materials.values() ) {
			material.uniforms.uHasDepthSensing.value = active;
			material.uniforms.uDepthTexture.value = depthTexture;
			material.uniforms.uDepthWidth.value = snapshot.viewportWidth;
			material.uniforms.uDepthHeight.value = snapshot.viewportHeight;
		}

		return active;

	}

	function isActive(): boolean {

		return snapshot.active;

	}

	function getDebugState(): DepthDebugState {

		if ( renderer.xr.isPresenting === false ) {
			return {
				label: 'Depth 未启动',
				detail: '进入 AR 会话后会检测 depth-sensing 状态。',
				tone: 'checking',
				active: false
			};
		}

		if ( renderer.capabilities.isWebGL2 === false ) {
			return {
				label: 'Depth 不可用',
				detail: '当前 WebGL 环境不支持 depth 调试遮挡，已回退普通显示。',
				tone: 'unsupported',
				active: false
			};
		}

		const session = renderer.xr.getSession() as ( XRSession & { enabledFeatures?: string[] } ) | null;
		const depthFeatureGranted = session?.enabledFeatures?.includes( 'depth-sensing' ) ?? false;
		if ( depthFeatureGranted === false ) {
			return {
				label: 'Depth 未授权',
				detail: '当前浏览器或设备没有返回 depth-sensing，X-Ray 会退回整模显示。',
				tone: 'unsupported',
				active: false
			};
		}

		if ( snapshot.active ) {
			return {
				label: 'Depth 已启用',
				detail: '真实遮挡判断正在生效，被墙或设备挡住的部分才会显示穿透辅助。',
				tone: 'supported',
				active: true
			};
		}

		return {
			label: 'Depth 等待中',
			detail: '会话已申请 depth-sensing，但当前还没有拿到有效深度帧。',
			tone: 'checking',
			active: false
		};

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
				uDepthTexture: { value: snapshot.depthTexture },
				uHasDepthSensing: { value: snapshot.active },
				uDepthWidth: { value: snapshot.viewportWidth },
				uDepthHeight: { value: snapshot.viewportHeight },
				uTintColor: {
					value: kind === 'xray' ? XRAY_COLOR.clone() : WIREFRAME_COLOR.clone()
				},
				uTintOpacity: {
					value: kind === 'xray' ? XRAY_OPACITY : WIREFRAME_OPACITY
				},
				uDepthBias: { value: DEPTH_COMPARE_BIAS }
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

	}

	return {
		update,
		isActive,
		getDebugState,
		getMaterial,
		dispose
	};

}
