import * as THREE from 'three';

export interface ArAnnotationItem {
	id: string;
	title: string;
	subtitle?: string;
	description?: string;
	layerName?: string;
	objectName?: string;
	properties?: Record<string, string | number>;
	targetObject: THREE.Object3D;
}

export interface ArAnnotationLabelController {
	setItems(items: ArAnnotationItem[]): void;
	update(camera: THREE.Camera): void;
	handleTap(clientX: number, clientY: number, camera: THREE.Camera): ArAnnotationItem | null;
	pick(raycaster: THREE.Raycaster): ArAnnotationItem | null;
	clear(): void;
	dispose(): void;
}

interface AnnotationLabelEntry {
	item: ArAnnotationItem;
	sprite: THREE.Sprite;
	texture: THREE.CanvasTexture;
	material: THREE.SpriteMaterial;
}

const ANNOTATION_LABEL_TAG = '__annotationLabel';
const DISPLAY_MODE_HELPER_TAG = '__displayModeHelper';
const tempBounds = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const tempWorldScale = new THREE.Vector3();

export function createArAnnotationLabelController(options: {
	canvas: HTMLCanvasElement;
}): ArAnnotationLabelController {

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	let entries: AnnotationLabelEntry[] = [];

	function setItems(items: ArAnnotationItem[]): void {

		clear();
		entries = items
			.map( ( item ) => createEntry( item ) )
			.filter( ( entry ): entry is AnnotationLabelEntry => entry !== null );

	}

	function update(camera: THREE.Camera): void {

		void camera;

	}

	function handleTap(clientX: number, clientY: number, camera: THREE.Camera): ArAnnotationItem | null {

		const rect = options.canvas.getBoundingClientRect();
		pointer.x = ( ( clientX - rect.left ) / rect.width ) * 2 - 1;
		pointer.y = - ( ( clientY - rect.top ) / rect.height ) * 2 + 1;
		raycaster.setFromCamera( pointer, camera );
		return pick( raycaster );

	}

	function pick(activeRaycaster: THREE.Raycaster): ArAnnotationItem | null {

		const hits = activeRaycaster.intersectObjects(
			entries.map( ( entry ) => entry.sprite ),
			true
		);
		if ( hits.length === 0 ) {
			return null;
		}

		const selected = resolveAnnotationItem( hits[ 0 ].object );
		return selected;

	}

	function clear(): void {

		for ( const entry of entries ) {
			entry.sprite.removeFromParent();
			entry.material.dispose();
			entry.texture.dispose();
		}
		entries = [];

	}

	function dispose(): void {

		clear();

	}

	return {
		setItems,
		update,
		handleTap,
		pick,
		clear,
		dispose
	};

}

function createEntry(item: ArAnnotationItem): AnnotationLabelEntry | null {

	item.targetObject.updateWorldMatrix( true, true );
	tempBounds.setFromObject( item.targetObject );
	if ( tempBounds.isEmpty() ) {
		return null;
	}

	tempBounds.getCenter( tempCenter );
	tempBounds.getSize( tempSize );
	item.targetObject.getWorldScale( tempWorldScale );

	const textureResult = createLabelTexture( item );
	const worldHeight = clamp( Math.max( 0.14, tempSize.y * 0.18 ), 0.14, 0.28 );
	const worldWidth = worldHeight * textureResult.aspect;
	const localWidth = worldWidth / safeScaleComponent( tempWorldScale.x );
	const localHeight = worldHeight / safeScaleComponent( tempWorldScale.y );
	const spriteMaterial = new THREE.SpriteMaterial( {
		map: textureResult.texture,
		transparent: true,
		depthWrite: false,
		toneMapped: false
	} );
	const sprite = new THREE.Sprite( spriteMaterial );
	sprite.name = `annotation-label-${item.id}`;
	sprite.center.set( 0.5, 0 );
	sprite.renderOrder = 210;
	sprite.scale.set( localWidth, localHeight, 1 );
	sprite.raycast = THREE.Sprite.prototype.raycast;
	sprite.userData[ ANNOTATION_LABEL_TAG ] = true;
	sprite.userData[ DISPLAY_MODE_HELPER_TAG ] = true;
	sprite.userData.__nonSelectableHelper = true;
	sprite.userData.__excludeFromLayerIndex = true;
	sprite.userData.__annotationItem = item;

	const worldPosition = new THREE.Vector3(
		tempCenter.x,
		tempBounds.max.y + Math.max( 0.08, tempSize.y * 0.15 ),
		tempCenter.z
	);
	item.targetObject.add( sprite );
	sprite.position.copy( item.targetObject.worldToLocal( worldPosition ) );

	return {
		item,
		sprite,
		texture: textureResult.texture,
		material: spriteMaterial
	};

}

function createLabelTexture(item: ArAnnotationItem): {
	texture: THREE.CanvasTexture;
	aspect: number;
} {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 1024;
	canvas.height = item.subtitle ? 320 : 220;

	const context = canvas.getContext( '2d' );
	if ( context === null ) {
		throw new Error( 'Failed to create annotation label canvas context.' );
	}

	context.clearRect( 0, 0, canvas.width, canvas.height );
	const gradient = context.createLinearGradient( 0, 0, canvas.width, canvas.height );
	gradient.addColorStop( 0, 'rgba(8, 15, 30, 0.92)' );
	gradient.addColorStop( 1, 'rgba(30, 41, 59, 0.82)' );
	drawRoundedRect( context, 24, 24, canvas.width - 48, canvas.height - 48, 54, gradient );

	context.strokeStyle = 'rgba(125, 211, 252, 0.75)';
	context.lineWidth = 4;
	roundRectPath( context, 24, 24, canvas.width - 48, canvas.height - 48, 54 );
	context.stroke();

	context.fillStyle = '#ffffff';
	context.font = 'bold 88px "Microsoft YaHei", sans-serif';
	context.fillText( item.title, 76, 132 );

	if ( item.subtitle ) {
		context.fillStyle = 'rgba(191, 219, 254, 0.94)';
		context.font = '52px "Microsoft YaHei", sans-serif';
		context.fillText( item.subtitle, 76, 226 );
	}

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;

	return {
		texture,
		aspect: canvas.width / canvas.height
	};

}

function resolveAnnotationItem(object: THREE.Object3D | null): ArAnnotationItem | null {

	let current: THREE.Object3D | null = object;
	while ( current !== null ) {
		const item = current.userData.__annotationItem;
		if ( isAnnotationItem( item ) ) {
			return item;
		}
		current = current.parent;
	}

	return null;

}

function isAnnotationItem(value: unknown): value is ArAnnotationItem {

	return typeof value === 'object'
		&& value !== null
		&& 'id' in value
		&& 'title' in value
		&& 'targetObject' in value;

}

function clamp(value: number, min: number, max: number): number {

	return Math.min( Math.max( value, min ), max );

}

function safeScaleComponent(value: number): number {

	return Math.abs( value ) > 1e-6 ? value : 1;

}

function drawRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
	fillStyle: CanvasFillStrokeStyles['fillStyle']
): void {

	context.fillStyle = fillStyle;
	roundRectPath( context, x, y, width, height, radius );
	context.fill();

}

function roundRectPath(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
): void {

	const safeRadius = Math.min( radius, width * 0.5, height * 0.5 );
	context.beginPath();
	context.moveTo( x + safeRadius, y );
	context.lineTo( x + width - safeRadius, y );
	context.quadraticCurveTo( x + width, y, x + width, y + safeRadius );
	context.lineTo( x + width, y + height - safeRadius );
	context.quadraticCurveTo( x + width, y + height, x + width - safeRadius, y + height );
	context.lineTo( x + safeRadius, y + height );
	context.quadraticCurveTo( x, y + height, x, y + height - safeRadius );
	context.lineTo( x, y + safeRadius );
	context.quadraticCurveTo( x, y, x + safeRadius, y );
	context.closePath();

}
