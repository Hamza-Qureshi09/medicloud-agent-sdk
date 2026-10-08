import type { CatalogTestEntry, CatalogView } from '../types.ts';
import { IFLASH_3000_TESTS } from '../machines/iflash/catalog.ts';
import { MAGLUMI_800_ASSAYS } from '../machines/maglumi800/catalog.ts';
import { SYSMEX_KX21N_ORDER_CATALOG } from '../machines/sysmexKx21n/catalog.ts';
import { SYSMEX_KX21N_RESULT_METADATA } from '../machines/sysmexKx21n/resultMetadata.ts';
import { BIOLABO_KENZA_240TX_CATALOG } from '../machines/biolaboKenza/catalog.ts';
import { DRACCU_AFI_6100B_CATALOG } from '../machines/draccuAfi6100b/catalog.ts';
import { sysmexKx21nMachineId } from '../machines/sysmexKx21n/index.ts';
import {
	biolaboKenzaMachineId,
	drAccuAfi6100bMachineId,
	iFlash3000MachineId,
	maglumi800MachineId,
} from '../machines/mod.ts';

function single(
	code: string,
	name: string,
	resultCode = code,
): CatalogTestEntry {
	return { code, name, analytes: [{ code: resultCode, name }] };
}

/** Tested defaults are inserted only when a managed catalog does not yet exist. */
export const MANAGED_CATALOG_SEEDS: readonly CatalogView[] = [
	{
		id: 'iflash3000',
		driverId: iFlash3000MachineId,
		machine: 'YHLO iFlash 3000',
		tests: IFLASH_3000_TESTS.map((test) => ({
			...single(test.testCode, test.testName, String(test.channelNumber)),
			enabled: test.isActive,
		})),
	},
	{
		id: 'snibe-maglumi-800',
		driverId: maglumi800MachineId,
		machine: 'SNIBE MAGLUMI 800',
		tests: MAGLUMI_800_ASSAYS.map((test) => ({
			...single(test.code, test.name),
			deviceCode: test.deviceCode,
			unit: test.unit,
			normalRange: test.normalRange,
			category: test.category,
			aliases: test.aliases ?? [],
		})),
	},
	{
		id: 'sysmex-kx21n',
		driverId: sysmexKx21nMachineId,
		machine: 'Sysmex KX-21N',
		tests: SYSMEX_KX21N_ORDER_CATALOG.map((test) => ({
			code: test.code,
			name: test.name,
			analytes: SYSMEX_KX21N_RESULT_METADATA.map((analyte) => ({
				code: analyte.code,
				name: analyte.name,
				unit: analyte.unit,
				category: analyte.category,
				decimals: analyte.decimals,
			})),
		})),
	},
	{
		id: 'biolabo-kenza',
		driverId: biolaboKenzaMachineId,
		machine: 'BioLabo Kenza 240TX',
		tests: BIOLABO_KENZA_240TX_CATALOG.map((test) => ({
			...single(test.code, test.name),
			slot: test.slot,
			aliases: test.aliases,
		})),
	},
	{
		id: 'draccu-afi-6100b',
		driverId: drAccuAfi6100bMachineId,
		machine: 'DrAccu AFI-6100B',
		tests: [...new Map(DRACCU_AFI_6100B_CATALOG.map((test) => [
			test.item_name,
			single(test.item_name, test.item_name, test.item_id),
		])).values()],
	},
];
