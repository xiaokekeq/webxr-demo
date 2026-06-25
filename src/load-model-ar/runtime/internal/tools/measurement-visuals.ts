import * as THREE from 'three';
import type { MeasurementMode } from '../../../registration/registration-store.js';

interface CreateMeasurementVisualsOptions {
	scene: THREE.Scene;
}

export interface MeasurementVisualsController {
	update(mode: MeasurementMode, points: THREE.Vector3[]): void;
	clear(): void;
	dispose(): void;
}

const MARKER_RADIUS = 0.025;
const MODE_COLORS: Record<MeasurementMode, number> = {
	'distance-3d': 0x2f6df6,
	'distance-horizontal': 0x1d9bf0,
	depth: 0xf97316
};

export function createMeasurementVisuals(
	options: CreateMeasurementVisualsOptions
): MeasurementVisualsController {

	const { scene } = options;
	const root = new THREE.Group();
	root.name = '__measurement-visuals';
	scene.add( root );

	const markerGeometry = new THREE.SphereGeometry( MARKER_RADIUS, 20, 16 );
	const markerMaterials = [ createMarkerMaterial(), createMarkerMaterial() ];
	const markers = markerMaterials.map( ( material, index ) => {
		const mesh = new THREE.Mesh( markerGeometry, material );
		mesh.name = `__measurement-marker-${index + 1}`;
		mesh.visible = false;
		root.add( mesh );
		return mesh;
	} );

	const lineGeometry = new THREE.BufferGeometry();
	const lineMaterial = new THREE.LineBasicMaterial( {
		color: MODE_COLORS[ 'distance-3d' ],
		transparent: true,
		opacity: 0.95
	} );
	const line = new THREE.Line( lineGeometry, lineMaterial );
	line.name = '__measurement-line';
	line.visible = false;
	root.add( line );

	return {
		update(mode, points) {

			const color = MODE_COLORS[ mode ];
			for ( const material of markerMaterials ) {
				material.color.setHex( color );
			}
			lineMaterial.color.setHex( color );

			markers.forEach( ( marker, index ) => {
				const point = points[ index ];
				if ( point === undefined ) {
					marker.visible = false;
					return;
				}

				marker.visible = true;
				marker.position.copy( point );
			} );

			if ( points.length >= 2 ) {
				line.geometry.dispose();
				line.geometry = new THREE.BufferGeometry().setFromPoints( points.slice( 0, 2 ) );
				line.visible = true;
			} else {
				line.visible = false;
			}

		},

		clear() {

			for ( const marker of markers ) {
				marker.visible = false;
			}
			line.visible = false;
			line.geometry.dispose();
			line.geometry = new THREE.BufferGeometry();

		},

		dispose() {

			this.clear();
			scene.remove( root );
			markerGeometry.dispose();
			for ( const material of markerMaterials ) {
				material.dispose();
			}
			line.geometry.dispose();
			lineMaterial.dispose();

		}
	};

}

function createMarkerMaterial(): THREE.MeshBasicMaterial {

	return new THREE.MeshBasicMaterial( {
		color: MODE_COLORS[ 'distance-3d' ],
		transparent: true,
		opacity: 0.96
	} );

}
