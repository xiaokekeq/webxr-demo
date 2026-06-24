import type {
	LoadModelArController,
	LoadModelArControllerState
} from '../ar-controller.js';

export type ArState = LoadModelArControllerState;
export type ArActions = LoadModelArController['actions'];
export type ArController = LoadModelArController;
export type AppState = ArState;
export type AppActions = ArActions;
