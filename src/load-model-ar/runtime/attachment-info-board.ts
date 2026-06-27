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

	const worldWidth = clamp( tempSize.x * 1.2, 0.32, 0.72 );
	const worldHeight = clamp( tempSize.y * 0.75, 0.2, 0.42 );
	const worldStemHeight = clamp( tempSize.y * 0.65, 0.16, 0.42 );
	const boardAnchor = new THREE.Vector3(
		tempCenter.x,
		tempBounds.max.y + Math.max( 0.08, tempSize.y * 0.12 ),
		tempCenter.z
	);

	const board = createInfoBoard( boardContent, {
		width: worldWidth / safeScaleComponent( tempWorldScale.x ),
		height: worldHeight / safeScaleComponent( tempWorldScale.y ),
		stemHeight: worldStemHeight / safeScaleComponent( tempWorldScale.y )
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
	}
): THREE.Group {

	const group = new THREE.Group();
	markAsAttachmentInfoBoard( group );

	const texture = createInfoBoardTexture( content );
	const frontPlate = createInfoBoardPlate( texture, dimensions );
	frontPlate.name = '__attachment-info-board-front-plate';
	group.add( frontPlate );

	const backPlate = createInfoBoardPlate( texture, dimensions );
	backPlate.name = '__attachment-info-board-back-plate';
	backPlate.rotation.y = Math.PI;
	group.add( backPlate );

	const stemRadius = Math.max( dimensions.width * 0.015, 0.008 );
	const stem = new THREE.Mesh(
		new THREE.CylinderGeometry( stemRadius, stemRadius, dimensions.stemHeight, 10 ),
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
): THREE.Mesh {

	const plate = new THREE.Mesh(
		new THREE.PlaneGeometry( dimensions.width, dimensions.height ),
		new THREE.MeshBasicMaterial( {
			map: texture,
			transparent: true,
			depthWrite: false,
			toneMapped: false,
			side: THREE.FrontSide
		} )
	);
	plate.position.y = dimensions.stemHeight + dimensions.height * 0.5;
	plate.renderOrder = 120;
	plate.raycast = () => {};
	markAsAttachmentInfoBoard( plate );
	return plate;

}

function createInfoBoardTexture(content: Required<DemoModelAttachmentInfo>): THREE.CanvasTexture {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 640;
	canvas.height = 360;

	const context = canvas.getContext( '2d' );
	if ( context === null ) {
		throw new Error( 'Failed to create attachment info board canvas context.' );
	}

	context.clearRect( 0, 0, canvas.width, canvas.height );

	const gradient = context.createLinearGradient( 0, 0, canvas.width, canvas.height );
	gradient.addColorStop( 0, 'rgba(10, 27, 52, 0.94)' );
	gradient.addColorStop( 1, 'rgba(12, 67, 92, 0.82)' );
	drawRoundedRect( context, 12, 12, canvas.width - 24, canvas.height - 24, 28, gradient );

	context.strokeStyle = 'rgba(120, 229, 255, 0.95)';
	context.lineWidth = 4;
	roundRectPath( context, 12, 12, canvas.width - 24, canvas.height - 24, 28 );
	context.stroke();

	context.fillStyle = '#ffffff';
	context.font = 'bold 44px "Microsoft YaHei", sans-serif';
	context.fillText( content.title, 40, 76 );

	const statusWidth = Math.max( 116, context.measureText( content.status ).width + 40 );
	const statusX = canvas.width - statusWidth - 40;
	drawRoundedRect( context, statusX, 34, statusWidth, 46, 23, 'rgba(82, 228, 154, 0.92)' );
	context.fillStyle = '#08341f';
	context.font = 'bold 24px "Microsoft YaHei", sans-serif';
	context.fillText( content.status, statusX + 20, 64 );

	context.fillStyle = 'rgba(220, 242, 255, 0.94)';
	context.font = '24px "Microsoft YaHei", sans-serif';
	context.fillText( `编号  ${content.code}`, 40, 142 );
	context.fillText( `类型  ${content.type}`, 40, 186 );

	context.fillStyle = 'rgba(193, 233, 255, 0.92)';
	context.font = '22px "Microsoft YaHei", sans-serif';
	fillWrappedText( context, `说明  ${content.remark}`, 40, 244, canvas.width - 80, 34, 3 );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
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
