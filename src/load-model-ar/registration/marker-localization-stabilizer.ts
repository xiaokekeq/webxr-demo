import type { MarkerLocalizationSolution } from './marker-localization.js';

export interface MarkerLocalizationStabilityOptions {
	minSampleCount: number;
	maxRmsErrorMeters: number;
	maxPositionStdMeters: number;
	maxHeadingStdDeg: number;
	maxSampleAgeMs: number;
}

export interface MarkerLocalizationStabilityReport {
	stable: boolean;
	sampleCount: number;
	averageRmsErrorMeters?: number;
	positionStdMeters?: number;
	headingStdDeg?: number;
	averagedSiteOriginArPosition?: { x: number; y: number; z: number };
	averagedHeadingDeg?: number;
	latestSolution?: MarkerLocalizationSolution;
	reason?: string;
}

const DEFAULT_OPTIONS: MarkerLocalizationStabilityOptions = {
	minSampleCount: 20,
	maxRmsErrorMeters: 0.3,
	maxPositionStdMeters: 0.2,
	maxHeadingStdDeg: 5,
	maxSampleAgeMs: 3000
};

export class MarkerLocalizationStabilizer {

	private readonly options: MarkerLocalizationStabilityOptions;
	private samples: MarkerLocalizationSolution[] = [];
	private report: MarkerLocalizationStabilityReport = {
		stable: false,
		sampleCount: 0,
		reason: 'No samples yet.'
	};

	constructor(options?: Partial<MarkerLocalizationStabilityOptions>) {

		this.options = {
			...DEFAULT_OPTIONS,
			...options
		};

	}

	addSample(solution: MarkerLocalizationSolution): MarkerLocalizationStabilityReport {

		this.samples.push( cloneSolution( solution ) );
		this.pruneSamples( solution.arFromEnuSolution.timestamp );
		this.report = this.buildReport();
		return cloneReport( this.report );

	}

	reset(): void {

		this.samples = [];
		this.report = {
			stable: false,
			sampleCount: 0,
			reason: 'No samples yet.'
		};

	}

	getReport(): MarkerLocalizationStabilityReport {

		if ( this.samples.length > 0 ) {
			this.pruneSamples( Date.now() );
			this.report = this.buildReport();
		}

		return cloneReport( this.report );

	}

	private pruneSamples(referenceTimestamp: number): void {

		const cutoffTimestamp = referenceTimestamp - this.options.maxSampleAgeMs;
		this.samples = this.samples.filter(
			( sample ) => sample.arFromEnuSolution.timestamp >= cutoffTimestamp
		);

	}

	private buildReport(): MarkerLocalizationStabilityReport {

		const sampleCount = this.samples.length;
		if ( sampleCount === 0 ) {
			return {
				stable: false,
				sampleCount: 0,
				reason: 'No samples yet.'
			};
		}

		const latestSolution = this.samples[ sampleCount - 1 ];
		if ( sampleCount < this.options.minSampleCount ) {
			return {
				stable: false,
				sampleCount,
				latestSolution,
				reason: `Need at least ${this.options.minSampleCount} samples.`
			};
		}

		const averageRmsErrorMeters = this.samples.reduce(
			( sum, sample ) => sum + sample.rmsErrorMeters,
			0
		) / sampleCount;
		const averagedSiteOriginArPosition = {
			x: this.samples.reduce( ( sum, sample ) => sum + sample.siteOriginArPosition.x, 0 ) / sampleCount,
			y: this.samples.reduce( ( sum, sample ) => sum + sample.siteOriginArPosition.y, 0 ) / sampleCount,
			z: this.samples.reduce( ( sum, sample ) => sum + sample.siteOriginArPosition.z, 0 ) / sampleCount
		};
		const positionStdMeters = Math.sqrt(
			this.samples.reduce( ( sumSquaredDistance, sample ) => {
				const dx = sample.siteOriginArPosition.x - averagedSiteOriginArPosition.x;
				const dy = sample.siteOriginArPosition.y - averagedSiteOriginArPosition.y;
				const dz = sample.siteOriginArPosition.z - averagedSiteOriginArPosition.z;
				return sumSquaredDistance + dx * dx + dy * dy + dz * dz;
			}, 0 ) / sampleCount
		);
		const averagedHeadingDeg = computeCircularMeanDegrees(
			this.samples.map( ( sample ) => sample.headingDeg )
		);
		const headingStdDeg = computeCircularStdDegrees(
			this.samples.map( ( sample ) => sample.headingDeg ),
			averagedHeadingDeg
		);

		if ( averageRmsErrorMeters > this.options.maxRmsErrorMeters ) {
			return {
				stable: false,
				sampleCount,
				averageRmsErrorMeters,
				positionStdMeters,
				headingStdDeg,
				averagedSiteOriginArPosition,
				averagedHeadingDeg,
				latestSolution,
				reason: `Average RMS exceeds ${this.options.maxRmsErrorMeters.toFixed( 3 )}m.`
			};
		}

		if ( positionStdMeters > this.options.maxPositionStdMeters ) {
			return {
				stable: false,
				sampleCount,
				averageRmsErrorMeters,
				positionStdMeters,
				headingStdDeg,
				averagedSiteOriginArPosition,
				averagedHeadingDeg,
				latestSolution,
				reason: `Position std exceeds ${this.options.maxPositionStdMeters.toFixed( 3 )}m.`
			};
		}

		if ( headingStdDeg > this.options.maxHeadingStdDeg ) {
			return {
				stable: false,
				sampleCount,
				averageRmsErrorMeters,
				positionStdMeters,
				headingStdDeg,
				averagedSiteOriginArPosition,
				averagedHeadingDeg,
				latestSolution,
				reason: `Heading std exceeds ${this.options.maxHeadingStdDeg.toFixed( 3 )}deg.`
			};
		}

		return {
			stable: true,
			sampleCount,
			averageRmsErrorMeters,
			positionStdMeters,
			headingStdDeg,
			averagedSiteOriginArPosition,
			averagedHeadingDeg,
			latestSolution,
			reason: 'Stable.'
		};

	}

}

function cloneSolution(solution: MarkerLocalizationSolution): MarkerLocalizationSolution {

	return {
		...solution,
		arFromEnuSolution: {
			...solution.arFromEnuSolution,
			matrix: solution.arFromEnuSolution.matrix.clone(),
			siteOriginArPosition: solution.arFromEnuSolution.siteOriginArPosition.clone(),
			orientation: solution.arFromEnuSolution.orientation.clone()
		},
		matrix: solution.matrix.clone(),
		siteOriginArPosition: solution.siteOriginArPosition.clone(),
		orientation: solution.orientation.clone()
	};

}

function cloneReport(report: MarkerLocalizationStabilityReport): MarkerLocalizationStabilityReport {

	return {
		...report,
		averagedSiteOriginArPosition: report.averagedSiteOriginArPosition === undefined
			? undefined
			: { ...report.averagedSiteOriginArPosition },
		latestSolution: report.latestSolution === undefined
			? undefined
			: cloneSolution( report.latestSolution )
	};

}

function computeCircularMeanDegrees(values: number[]): number {

	const sum = values.reduce( ( accumulator, value ) => {
		const radians = value * Math.PI / 180;
		accumulator.x += Math.cos( radians );
		accumulator.y += Math.sin( radians );
		return accumulator;
	}, { x: 0, y: 0 } );

	return normalizeDegrees( Math.atan2( sum.y, sum.x ) * 180 / Math.PI );

}

function computeCircularStdDegrees(values: number[], meanDeg: number): number {

	return Math.sqrt(
		values.reduce( ( sum, value ) => {
			const delta = normalizeSignedDegrees( value - meanDeg );
			return sum + delta * delta;
		}, 0 ) / values.length
	);

}

function normalizeDegrees(value: number): number {

	return ( ( value % 360 ) + 360 ) % 360;

}

function normalizeSignedDegrees(value: number): number {

	const normalized = normalizeDegrees( value );
	return normalized > 180 ? normalized - 360 : normalized;

}
