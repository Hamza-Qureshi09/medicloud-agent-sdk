import type { CatalogTestEntry } from '../../types.ts';

/**
 * FAKE CATALOG FOR DISCOVERY ONLY.
 * The lab has not supplied Bonavera 200 order test numbers or verified result codes.
 * This entry keeps the machine visible in catalog-based UI flows, but it is not
 * an analyzer test. The driver rejects this code before any DSR order is sent.
 * Replace it with verified analyzer order codes and OBX result analytes after
 * reviewing lab captures. Cloud orders selecting this fake test fail before
 * transmission. Unmatched ORU results also fail normal persistence, but their
 * assay number, name and unit are saved to
 * ./data/bonavera200-catalog-captures.jsonl in the SDK process directory.
 * Do not infer an order code from an OBX code alone.
 */
export const BONAVERA_200_PLACEHOLDER_TEST_CODE = 'BONAVERA_200_UNVERIFIED';

export const BONAVERA_200_PLACEHOLDER_CATALOG: readonly CatalogTestEntry[] = [{
	code: BONAVERA_200_PLACEHOLDER_TEST_CODE,
	name: 'FAKE Bonavera 200 test, discovery only',
	analytes: [],
}];
