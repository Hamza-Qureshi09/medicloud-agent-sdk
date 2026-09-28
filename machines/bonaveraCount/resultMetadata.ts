/** CBC parameter catalog from the Bonavera Count reference UI/store. */

export interface BonaveraCountResultMetadata {
	code: string;
	name: string;
	unit: string;
	normalRange: string;
	ref_range?: { low?: string; high?: string };
	reference_low?: string;
	reference_high?: string;
	category: string;
}

const BONAVERA_COUNT_RESULT_METADATA_BASE:
	readonly BonaveraCountResultMetadata[] = [
		{
			code: 'WBC',
			name: 'White Blood Cells',
			unit: '10^3/uL',
			normalRange: '4.0-10.0',
			category: 'WBC',
		},
		{
			code: 'RBC',
			name: 'Red Blood Cells',
			unit: '10^6/uL',
			normalRange: '4.0-5.5',
			category: 'RBC',
		},
		{
			code: 'HGB',
			name: 'Hemoglobin',
			unit: 'g/dL',
			normalRange: '12.0-17.0',
			category: 'RBC',
		},
		{
			code: 'HCT',
			name: 'Hematocrit',
			unit: '%',
			normalRange: '36.0-50.0',
			category: 'RBC',
		},
		{
			code: 'MCV',
			name: 'Mean Corpuscular Volume',
			unit: 'fL',
			normalRange: '80.0-100.0',
			category: 'RBC Indices',
		},
		{
			code: 'MCH',
			name: 'Mean Corpuscular Hemoglobin',
			unit: 'pg',
			normalRange: '27.0-34.0',
			category: 'RBC Indices',
		},
		{
			code: 'MCHC',
			name: 'Mean Corpuscular Hb Concentration',
			unit: 'g/dL',
			normalRange: '32.0-36.0',
			category: 'RBC Indices',
		},
		{
			code: 'PLT',
			name: 'Platelet Count',
			unit: '10^3/uL',
			normalRange: '150-400',
			category: 'Platelet',
		},
		{
			code: 'RDW-CV',
			name: 'Red Cell Distribution Width CV',
			unit: '%',
			normalRange: '11.0-16.0',
			category: 'RBC Indices',
		},
		{
			code: 'RDW-SD',
			name: 'Red Cell Distribution Width SD',
			unit: 'fL',
			normalRange: '35.0-56.0',
			category: 'RBC Indices',
		},
		{
			code: 'MPV',
			name: 'Mean Platelet Volume',
			unit: 'fL',
			normalRange: '7.0-11.0',
			category: 'Platelet',
		},
		{
			code: 'PDW',
			name: 'Platelet Distribution Width',
			unit: 'fL',
			normalRange: '9.0-17.0',
			category: 'Platelet',
		},
		{
			code: 'PCT',
			name: 'Plateletcrit',
			unit: '%',
			normalRange: '0.1-0.5',
			category: 'Platelet',
		},
		{
			code: 'P-LCR',
			name: 'Platelet Large Cell Ratio',
			unit: '%',
			normalRange: '13.0-43.0',
			category: 'Platelet',
		},
		{
			code: 'LYM#',
			name: 'Lymphocyte Count',
			unit: '10^3/uL',
			normalRange: '1.0-3.5',
			category: 'WBC Differential',
		},
		{
			code: 'LYM%',
			name: 'Lymphocyte Percentage',
			unit: '%',
			normalRange: '20.0-40.0',
			category: 'WBC Differential',
		},
		{
			code: 'MID#',
			name: 'Mid-Range Abs Count',
			unit: '10^3/uL',
			normalRange: '0.1-0.9',
			category: 'WBC Differential',
		},
		{
			code: 'MID%',
			name: 'Mid-Range Percentage',
			unit: '%',
			normalRange: '3.0-9.0',
			category: 'WBC Differential',
		},
		{
			code: 'GRA#',
			name: 'Granulocyte Count',
			unit: '10^3/uL',
			normalRange: '2.0-7.0',
			category: 'WBC Differential',
		},
		{
			code: 'GRA%',
			name: 'Granulocyte Percentage',
			unit: '%',
			normalRange: '50.0-70.0',
			category: 'WBC Differential',
		},
	];

export const BONAVERA_COUNT_RESULT_METADATA:
	readonly BonaveraCountResultMetadata[] = BONAVERA_COUNT_RESULT_METADATA_BASE
		.map((entry) => {
			const refRange = parseReferenceRange(entry.normalRange);
			return {
				...entry,
				ref_range: refRange,
				reference_low: refRange?.low,
				reference_high: refRange?.high,
			};
		});

function parseReferenceRange(
	value: string,
): { low?: string; high?: string } | undefined {
	const range = value.trim();
	if (!range.includes('-')) return undefined;
	const dashIdx = range.indexOf('-', range.startsWith('-') ? 1 : 0);
	if (dashIdx <= 0) return undefined;
	const low = range.slice(0, dashIdx).trim();
	const high = range.slice(dashIdx + 1).trim();
	return low || high
		? { low: low || undefined, high: high || undefined }
		: undefined;
}
