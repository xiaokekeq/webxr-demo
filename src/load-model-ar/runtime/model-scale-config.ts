export type ModelScaleCalibration =
	| {
		mode: 'fixed-factor';
		factor: number;
		note: string;
	}
	| {
		mode: 'fit-longest-edge';
		longestEdgeMeters: number;
		note: string;
	};

export const MODEL_SCALE_CALIBRATION: ModelScaleCalibration = {
	mode: 'fit-longest-edge',
	longestEdgeMeters: 0.9,
	note: '先用最长边 0.9m 做一次固定尺度校正，确认真实尺寸后再改成你的现场值。'
};
