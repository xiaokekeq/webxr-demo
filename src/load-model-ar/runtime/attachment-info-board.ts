import * as THREE from 'three';
import type { DemoModelAttachmentInfo } from '../data/demo-model-config.js';

const ATTACHMENT_INFO_BOARD_TAG = '__attachmentInfoBoard';
const DISPLAY_MODE_HELPER_TAG = '__displayModeHelper';
const tempBounds = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempCenter = new THREE.Vector3();
const tempWorldScale = new THREE.Vector3();

export function attachInfoBoardToAttachment(
	attachmentRoot: THREE.Group,
	info: DemoModelAttachmentInfo
): void {

	const boardContent = normalizeBoardContent( info );
	if ( boardContent === null ) {
		return;
	}

	attachmentRoot.updateWorldMatrix( true, true );
	tempBounds.setFromObject( attachmentRoot );
	if ( tempBounds.isEmpty() ) {
		return;
	}

	tempBounds.getSize( tempSize );
	tempBounds.getCenter( tempCenter );
	attachmentRoot.getWorldScale( tempWorldScale );

	const worldWidth = clamp( tempSize.x * 2.2, 0.85, 1.45 );
	const worldHeight = clamp( tempSize.y * 1.45, 0.42, 0.76 );
	const worldStemHeight = clamp( tempSize.y * 1.4, 0.55, 1.1 );
	const boardRadius = worldWidth * 0.24;
	const boardAnchor = new THREE.Vector3(
		tempCenter.x,
		tempBounds.max.y + Math.max( 0.22, tempSize.y * 0.32 ),
		tempCenter.z
	);

	const board = createInfoBoard( boardContent, {
		width: worldWidth / safeScaleComponent( tempWorldScale.x ),
		height: worldHeight / safeScaleComponent( tempWorldScale.y ),
		stemHeight: worldStemHeight / safeScaleComponent( tempWorldScale.y ),
		radius: boardRadius / safeScaleComponent( tempWorldScale.x )
	} );

	attachmentRoot.add( board );
	board.position.copy( attachmentRoot.worldToLocal( boardAnchor ) );

}

export function setAttachmentInfoBoardVisibility(
	root: THREE.Object3D | null,
	visible: boolean
): void {

	if ( root === null ) {
		return;
	}

	root.traverse( ( child ) => {
		if ( child.userData[ ATTACHMENT_INFO_BOARD_TAG ] === true ) {
			child.visible = visible;
		}
	} );

}

function createInfoBoard(
	content: Required<DemoModelAttachmentInfo>,
	dimensions: {
		width: number;
		height: number;
		stemHeight: number;
		radius: number;
	}
): THREE.Group {

	const group = new THREE.Group();
	markAsAttachmentInfoBoard( group );

	const texture = createInfoBoardTexture( content );
	const plate = createInfoBoardPlate( texture, dimensions );
	group.add( plate );

	const stemRadius = Math.max( dimensions.width * 0.02, 0.012 );
	const stem = new THREE.Mesh(
		new THREE.CylinderGeometry( stemRadius, stemRadius, dimensions.stemHeight, 12 ),
		new THREE.MeshBasicMaterial( {
			color: 0x6fd9ff,
			transparent: true,
			opacity: 0.9,
			depthWrite: false,
			toneMapped: false
		} )
	);
	stem.name = '__attachment-info-board-stem';
	stem.position.y = dimensions.stemHeight * 0.5;
	stem.renderOrder = 119;
	stem.raycast = () => {};
	markAsAttachmentInfoBoard( stem );
	group.add( stem );

	return group;

}

function createInfoBoardPlate(
	texture: THREE.Texture,
	dimensions: {
		width: number;
		height: number;
		stemHeight: number;
	}
): THREE.Sprite {

	const plate = new THREE.Sprite(
		new THREE.SpriteMaterial( {
			map: texture,
			transparent: true,
			alphaTest: 0.04,
			depthWrite: false,
			toneMapped: false
		} )
	);

	plate.position.y = dimensions.stemHeight + dimensions.height * 0.5;
	plate.center.set( 0.5, 0 );
	plate.scale.set( dimensions.width, dimensions.height, 1 );
	plate.renderOrder = 120;
	plate.raycast = THREE.Sprite.prototype.raycast;
	markAsAttachmentInfoBoard( plate );
	return plate;

}

function createInfoBoardTexture(content: Required<DemoModelAttachmentInfo>): THREE.CanvasTexture {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 1536;
	canvas.height = 896;

	const context = canvas.getContext( '2d' );
	if ( context === null ) {
		throw new Error( 'Failed to create attachment info board canvas context.' );
	}

	context.clearRect( 0, 0, canvas.width, canvas.height );

	const gradient = context.createLinearGradient( 0, 0, canvas.width, canvas.height );
	gradient.addColorStop( 0, 'rgba(10, 27, 52, 0.94)' );
	gradient.addColorStop( 1, 'rgba(12, 67, 92, 0.82)' );
	drawRoundedRect( context, 24, 24, canvas.width - 48, canvas.height - 48, 56, gradient );

	context.strokeStyle = 'rgba(120, 229, 255, 0.95)';
	context.lineWidth = 8;
	roundRectPath( context, 24, 24, canvas.width - 48, canvas.height - 48, 56 );
	context.stroke();

	context.fillStyle = '#ffffff';
	context.font = 'bold 98px "Microsoft YaHei", sans-serif';
	context.fillText( content.title, 92, 156 );

	const statusWidth = Math.max( 240, context.measureText( content.status ).width + 84 );
	const statusX = canvas.width - statusWidth - 88;
	drawRoundedRect( context, statusX, 68, statusWidth, 94, 44, 'rgba(82, 228, 154, 0.92)' );
	context.fillStyle = '#08341f';
	context.font = 'bold 52px "Microsoft YaHei", sans-serif';
	context.fillText( content.status, statusX + 42, 129 );

	context.fillStyle = 'rgba(220, 242, 255, 0.94)';
	context.font = '52px "Microsoft YaHei", sans-serif';
	context.fillText( `编号  ${content.code}`, 92, 296 );
	context.fillText( `类型  ${content.type}`, 92, 394 );

	context.fillStyle = 'rgba(193, 233, 255, 0.92)';
	context.font = '46px "Microsoft YaHei", sans-serif';
	fillWrappedText( context, `说明  ${content.remark}`, 92, 536, canvas.width - 184, 72, 3 );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;

}

function normalizeBoardContent(info: DemoModelAttachmentInfo): Required<DemoModelAttachmentInfo> | null {

	const title = info.title ?? '附件标注';
	const code = info.code ?? '--';
	const type = info.type ?? '附件';
	const status = info.status ?? '正常';
	const remark = info.remark ?? '现场标注';

	if ( title.length === 0 && code.length === 0 && type.length === 0 && remark.length === 0 ) {
		return null;
	}

	return { title, code, type, status, remark };

}

function markAsAttachmentInfoBoard(object: THREE.Object3D): void {

	object.userData[ ATTACHMENT_INFO_BOARD_TAG ] = true;
	object.userData.__nonSelectableHelper = true;
	object.userData.__excludeFromLayerIndex = true;
	object.userData[ DISPLAY_MODE_HELPER_TAG ] = true;

}

function clamp(value: number, min: number, max: number): number {

	return Math.min( Math.max( value, min ), max );

}

function safeScaleComponent(value: number): number {

	return Math.abs( value ) > 1e-6 ? value : 1;

}

function fillWrappedText(
	context: CanvasRenderingContext2D,
	text: string,
	x: number,
	startY: number,
	maxWidth: number,
	lineHeight: number,
	maxLines: number
): void {

	const characters = Array.from( text );
	let currentLine = '';
	let y = startY;
	let lineCount = 0;

	for ( const character of characters ) {
		const nextLine = currentLine + character;
		if ( context.measureText( nextLine ).width <= maxWidth ) {
			currentLine = nextLine;
			continue;
		}

		context.fillText( currentLine, x, y );
		lineCount += 1;
		if ( lineCount >= maxLines ) {
			return;
		}

		currentLine = character;
		y += lineHeight;
	}

	if ( currentLine.length > 0 && lineCount < maxLines ) {
		context.fillText( currentLine, x, y );
	}

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
