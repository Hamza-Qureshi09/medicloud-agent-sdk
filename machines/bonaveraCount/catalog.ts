export const BONAVERA_COUNT_MODELS = [
	'Biogeny BONAVERA Count',
	'Bonavera Count',
	'Bonavera Count3R',
] as const;

/** The tested outbound builder always requests the complete CBC panel. */
export const BONAVERA_COUNT_ORDER_CATALOG = [{
	code: 'CBC',
	name: 'Complete Blood Count (CBC)',
}] as const;
