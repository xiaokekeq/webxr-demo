import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createLoadModelArController } from '../ar-controller.js';
import type { ArActions, ArState } from './ar-state.js';

export const arController = createLoadModelArController();

export const arStore = createStore<ArState>()( () => arController.getState() );

arController.subscribe( () => {
	arStore.setState( arController.getState() );
} );

export function useArStore<T>(selector: (state: ArState) => T): T {

	return useStore( arStore, selector );

}

export function useArActions(): ArActions {

	return arController.actions;

}

export function initializeArRuntime(): Promise<void> {

	return arController.initialize();

}

export function disposeArRuntime(): void {

	arController.dispose();

}

export function setArLayoutMode(isDesktopLayout: boolean): void {

	arController.setLayoutMode( isDesktopLayout );

}

export function mountArHosts(hosts: Parameters<typeof arController.mountHosts>[ 0 ]): void {

	arController.mountHosts( hosts );

}

export const appController = arController;
export const appStore = arStore;
export const useAppStore = useArStore;
export const useAppActions = useArActions;
export const initializeAppRuntime = initializeArRuntime;
export const disposeAppRuntime = disposeArRuntime;
export const setAppLayoutMode = setArLayoutMode;
export const mountAppHosts = mountArHosts;
