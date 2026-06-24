export function isNonNullish<T>(value: T | null | undefined): value is T {

	return value !== null && value !== undefined;

}

export function isFiniteNumber(value: unknown): value is number {

	return typeof value === 'number' && Number.isFinite( value );

}
