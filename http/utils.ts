import * as z from '@zod/zod';
import { CatalogInUseError } from '../store/catalogStore.ts';
import { BONAVERA_COUNT_ORDER_CATALOG } from '../machines/bonaveraCount/catalog.ts';
import { BONAVERA_COUNT_RESULT_METADATA } from '../machines/bonaveraCount/resultMetadata.ts';
import { BONAVERA_200_PLACEHOLDER_CATALOG } from '../machines/bonavera200/catalog.ts';
import { COBAS_C111_CATALOG } from '../machines/rocheCobasC111/catalog.ts';
import type { CatalogTestEntry, CatalogView } from '../types.ts';

const bonaveraCountAnalytes = BONAVERA_COUNT_RESULT_METADATA.map((analyte) => ({
  code: analyte.code,
  name: analyte.name,
  unit: analyte.unit,
}));

/** These three catalogs remain static until analyzer verification is complete. */
export const STATIC_CATALOGS: readonly CatalogView[] = [
  {
    id: 'roche-cobas-c111',
    driverId: 'roche-cobas-c111',
    machine: 'Roche cobas c111',
    tests: COBAS_C111_CATALOG.map((test): CatalogTestEntry => ({
      code: test.hostCode,
      name: test.shortName,
      analytes: [{ code: test.hostCode, name: test.shortName }],
    })),
    source: 'static',
  },
  {
    id: 'bonavera-200',
    driverId: 'bonavera-200',
    machine: 'Bonavera 200',
    tests: BONAVERA_200_PLACEHOLDER_CATALOG,
    source: 'static',
  },
  {
    id: 'bonavera-count',
    driverId: 'bonavera-count',
    machine: 'Biogeny BONAVERA Count',
    tests: BONAVERA_COUNT_ORDER_CATALOG.map((test) => ({
      code: test.code,
      name: test.name,
      analytes: bonaveraCountAnalytes,
    })),
    source: 'static',
  },
];

export function findStaticCatalog(value: string): CatalogView | undefined {
  const key = value.toLowerCase();
  return STATIC_CATALOGS.find((catalog) =>
    catalog.driverId.toLowerCase() === key ||
    catalog.machine.toLowerCase() === key
  );
}
// response-helper
export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: defaultHeaders({
			'content-type': 'application/json; charset=utf-8',
		}),
	});
}

export function empty(status = 204): Response {
	return new Response(null, { status, headers: defaultHeaders() });
}

export class HttpError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = 'HttpError';
	}
}

export function defaultHeaders(headers: HeadersInit = {}): Headers {
	const result = new Headers(headers);
	result.set('access-control-allow-origin', '*');
	result.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
	result.set('access-control-allow-headers', 'content-type');
	return result;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function errorResponse(error: unknown): Response {
	if (error instanceof CatalogInUseError) {
		return json({ error: error.message }, 409);
	}
	if (error instanceof HttpError) {
		return json({ error: error.message }, error.status);
	}
	if (error instanceof z.ZodError) {
		return json({ error: z.prettifyError(error) }, 400);
	}

	return json({ error: 'internal error', detail: errorMessage(error) }, 500);
}
