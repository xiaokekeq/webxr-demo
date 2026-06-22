export interface AbsoluteSiteTarget {
	mode: 'absolute-site';
	label: string;
	latitude: number;
	longitude: number;
	altitude?: number;
	targetHeadingDeg: number;
	assetYawOffsetDeg?: number;
}

export interface DemoOffsetTarget {
	mode: 'demo-offset';
	label: string;
	eastMeters: number;
	northMeters: number;
	targetHeadingDeg: number;
	assetYawOffsetDeg?: number;
}

export type CoarseRegistrationTarget = AbsoluteSiteTarget | DemoOffsetTarget;

export const COARSE_REGISTRATION_TARGET: CoarseRegistrationTarget = {
	mode: 'demo-offset',
	label: 'Demo coarse pose',
	eastMeters: 0,
	northMeters: 4,
	targetHeadingDeg: 0,
	assetYawOffsetDeg: 0
};
