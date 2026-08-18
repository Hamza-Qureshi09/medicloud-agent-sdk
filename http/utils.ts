import * as z from '@zod/zod';
import { IFLASH_3000_TESTS } from '../machines/iflash/catalog.ts';
import { iFlash3000MachineId } from '../machines/iflash/iFlash3000.ts';
import { MAGLUMI_800_ASSAYS } from '../machines/maglumi800/catalog.ts';
import { maglumi800MachineId } from '../machines/maglumi800/maglumi800.ts';
import { COBAS_C111_CATALOG } from '../machines/rocheCobasC111/catalog.ts';
import { rocheCobasC111MachineId } from '../machines/rocheCobasC111/rocheCobasC111.ts';
import { SYSMEX_KX21N_ORDER_CATALOG } from '../machines/sysmexKx21n/catalog.ts';
import { sysmexKx21nMachineId } from '../machines/sysmexKx21n/sysmexKx21n.ts';
import type { CatalogTestEntry, CatalogView } from '../types.ts';

// All Catalog normalization
const iflashTests: readonly CatalogTestEntry[] = IFLASH_3000_TESTS.map((t) => ({
	code: t.testCode,
	name: t.testName,
}));

const maglumiTests: readonly CatalogTestEntry[] = MAGLUMI_800_ASSAYS.map((t) => ({
	code: t.code,
	name: t.name,
}));

const cobasTests: readonly CatalogTestEntry[] = COBAS_C111_CATALOG.map((t) => ({
	code: t.hostCode,
	name: t.shortName,
}));

const sysmexTests: readonly CatalogTestEntry[] = SYSMEX_KX21N_ORDER_CATALOG.map((t) => ({
	code: t.code,
	name: t.name,
}));

// catalog manager
const CATALOGS: readonly CatalogView[] = [
	{
		id: iFlash3000MachineId,
		driverId: iFlash3000MachineId,
		machine: 'YHLO iFlash 3000',
		tests: iflashTests,
	},
	{
		id: maglumi800MachineId,
		driverId: maglumi800MachineId,
		machine: 'SNIBE MAGLUMI 800',
		tests: maglumiTests,
	},
	{
		id: rocheCobasC111MachineId,
		driverId: rocheCobasC111MachineId,
		machine: 'Roche cobas c111',
		tests: cobasTests,
	},
	{
		id: sysmexKx21nMachineId,
		driverId: sysmexKx21nMachineId,
		machine: 'Sysmex KX-21N',
		tests: sysmexTests,
	},
];

// reuseable-helpers
export function findCatalog(value: string): CatalogView | undefined {
	const key = value.toLowerCase();
	return CATALOGS.find((catalog) =>
		catalog.id.toLowerCase() === key ||
		catalog.driverId.toLowerCase() === key ||
		catalog.machine.toLowerCase() === key
	);
}
export function listCatalogs(): Array<Record<string, unknown>> {
	return CATALOGS.map((catalog) => ({
		id: catalog.id,
		driverId: catalog.driverId,
		machine: catalog.machine,
		catalogCount: catalog.tests.length,
		// testCount: catalog.tests.length,
	}));
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
	if (error instanceof HttpError) {
		return json({ error: error.message }, error.status);
	}
	if (error instanceof z.ZodError) {
		return json({ error: z.prettifyError(error) }, 400);
	}

	return json({ error: 'internal error', detail: errorMessage(error) }, 500);
}
