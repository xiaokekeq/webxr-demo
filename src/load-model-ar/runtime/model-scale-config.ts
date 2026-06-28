export interface ModelScaleCalibration {
	mode: 'real-world-scale';
	note: string;
}

export const MODEL_SCALE_CALIBRATION: ModelScaleCalibration = {
	mode: 'real-world-scale',
	note: 'AR 放置默认保持模型真实米制比例，不再按展示预览自动压缩最长边。'
};
