import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import type { CatalogTestEntry } from '../types.ts';
import { SqliteMachineDatabase } from '../db/sqLite.ts';
import {
	IFLASH_3000_TESTS,
	requireIFlashTestEntry,
} from '../machines/iflash/catalog.ts';
import { findMaglumiAssay } from '../machines/maglumi800/catalog.ts';
import { findKenzaAssay } from '../machines/biolaboKenza/catalog.ts';
import { parseIFlashMessage } from '../machines/iflash/inbound.ts';
import { parseMaglumiMessage } from '../machines/maglumi800/inbound.ts';
import { parseCobasC111Message } from '../machines/rocheCobasC111/inbound.ts';
import { parseSysmexKx21nPayload } from '../machines/sysmexKx21n/inbound.ts';
import { parseAstmMessage } from '../protocols/astm/records.ts';
import { findStaticCatalog } from '../http/utils.ts';

Deno.test('managed catalogs seed once, persist edits, and drive wire lookups', () => {
	const directory = Deno.makeTempDirSync();
	const path = join(directory, 'machines.db');
	const database = new SqliteMachineDatabase({ path });
	try {
		database.connect();
		const iflash = database.catalogs.get('iflash3000');
		assert(iflash);
		assert.equal(iflash.source, 'database');
		for (const test of IFLASH_3000_TESTS) {
			const parsed = parseIFlashMessage(
				parseAstmMessage(
					`H|\\^&|||YHLO^iFlash3000^123
O|1||SAMPLE
R|1|${test.channelNumber}^${test.testName}^^F|8.67|pg/mL
L|1|N`,
				),
				'test',
			);
			const published: CatalogTestEntry | undefined = iflash.tests.find((
				entry,
			) => entry.code === test.testCode);
			assert(published);
			assert(parsed.result);
			assert.equal(
				published.analytes[0].code,
				parsed.result.results[0].assayNo,
			);
		}
		assert.equal(requireIFlashTestEntry('FT4_1').channelNumber, 339);
		assert.equal(findMaglumiAssay('HCG/B-HCG II')?.code, 'T-B HCG II');
		assert.equal(findKenzaAssay('GLUCOSE')?.code, 'GL');

		const maglumi = database.catalogs.get('snibe-maglumi-800');
		assert(maglumi);
		const test = maglumi.tests.find((entry) => entry.code === 'T-B HCG II');
		assert(test);
		database.catalogs.upsertTest(maglumi.driverId, {
			...test,
			aliases: [...(test.aliases ?? []), 'CUSTOM HCG'],
		});
		assert.equal(findMaglumiAssay('CUSTOM HCG')?.code, test.code);
		database.close();
		database.connect();
		assert.equal(findMaglumiAssay('CUSTOM HCG')?.code, test.code);
		assert.equal(
			database.catalogs.get('snibe-maglumi-800')?.tests.length,
			maglumi.tests.length,
		);

		const protectedTest = {
			code: 'TEMP',
			name: 'Temporary',
			analytes: [{ code: '999', name: 'Temporary' }],
		};
		database.catalogs.upsertTest('iflash3000', protectedTest);
		const profileId = database.profiles.insert({
			driverId: 'iflash3000',
			config: {},
		});
		const orderId = database.orders.insert({
			machineId: profileId,
			sampleId: 'CATALOG-GUARD',
			tests: ['TEMP'],
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
		});
		assert.throws(
			() => database.catalogs.deleteTest('iflash3000', 'TEMP'),
			/pending or running order/,
		);
		assert.throws(
			() => database.catalogs.upsertTest('iflash3000', protectedTest),
			/pending or running order/,
		);
		database.orders.update(orderId, { status: 'completed' });
		assert.equal(database.catalogs.deleteTest('iflash3000', 'TEMP'), true);

		assert.equal(
			database.catalogs.get('sysmex-kx21n')?.tests[0].code,
			'CBC',
		);
		const cbc = database.catalogs.get('sysmex-kx21n')?.tests[0];
		assert(cbc);
		database.catalogs.upsertTest('sysmex-kx21n', {
			...cbc,
			analytes: cbc.analytes.map((analyte) =>
				analyte.code === 'WBC'
					? { ...analyte, unit: 'custom-unit' }
					: analyte
			),
		});
		const raw = 'O|1|SAMPLE\r' +
			cbc.analytes.map((analyte, i) => `R|${i + 1}|${analyte.code}|8.67`)
				.join('\r');
		const sysmex = parseSysmexKx21nPayload(raw, {
			outputFormat: 'auto',
			dateOrder: 'ymd',
		});
		assert(sysmex.result);
		assert.equal(
			sysmex.result.payload.results.find((result) =>
				result.assayNo === 'WBC'
			)?.unit,
			'custom-unit',
		);
		assert.deepEqual(
			sysmex.result.payload.results.map((result) => result.assayNo),
			cbc.analytes.map((analyte) => analyte.code),
		);
		assert(!cbc.analytes.some((analyte) => analyte.code === 'CBC'));

		const parsedMaglumi = parseMaglumiMessage(
			parseAstmMessage('O|1|SAMPLE\rR|1|HCG/B-HCG II|8.67|mIU/mL'),
			'test',
		);
		assert(parsedMaglumi.result);
		assert.equal(
			parsedMaglumi.result.results[0].assayNo,
			test.analytes[0].code,
		);
		const parsedCobas = parseCobasC111Message(
			parseAstmMessage('O|1|SAMPLE\rR|1|158|8.67|U/L'),
			'test',
		);
		const cobas = findStaticCatalog('Roche cobas c111')?.tests.find((
			entry,
		) => entry.code === '158');
		assert(cobas);
		assert(parsedCobas.result);
		assert.equal(
			parsedCobas.result.results[0].assayNo,
			cobas.analytes[0].code,
		);
		assert.equal(findStaticCatalog('Bonavera 200')?.source, 'static');
	} finally {
		database.close();
		for (const suffix of ['', '-wal', '-shm']) {
			try {
				Deno.removeSync(path + suffix);
			} catch (error) {
				if (!(error instanceof Deno.errors.NotFound)) {
					console.error(error);
				}
			}
		}
		Deno.removeSync(directory);
	}
});
