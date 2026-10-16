import type { MachineOrder } from '../../types.ts';
import {
	astmField,
	type AstmRecord,
	buildAstmRecord,
	escapeAstmText,
	joinAstmRepeats,
} from '../../protocols/astm/records.ts';
import { toMaglumiDeviceCode } from './catalog.ts';

function nowStamp(): string {
	const date = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${
		pad(date.getDate())
	}` +
		`${pad(date.getHours())}${pad(date.getMinutes())}${
			pad(date.getSeconds())
		}`;
}

function header(requestHeader?: AstmRecord): string {
	return buildAstmRecord([
		'H',
		'\\^&',
		'',
		'PSWD',
		requestHeader ? astmField(requestHeader, 10) || 'Lis' : 'Lis',
		'',
		'',
		'',
		'',
		requestHeader
			? astmField(requestHeader, 5) || 'Maglumi 800'
			: 'Maglumi 800',
		'',
		'P',
		'E1394-97',
		nowStamp(),
	]);
}

function birthDate(value = ''): string {
	const match = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(value);
	return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function sexCode(value = ''): string {
	switch (value.trim().toLowerCase()) {
		case 'm':
		case 'male':
			return 'M';
		case 'f':
		case 'female':
			return 'F';
		default:
			return 'U';
	}
}

function patientRecord(order: MachineOrder): string {
	const patientId = order.patientId ?? order.sampleId;
	return buildAstmRecord([
		'P',
		'1',
		'',
		escapeAstmText(patientId),
		escapeAstmText(patientId),
		escapeAstmText(order.patientName ?? ''),
		'',
		birthDate(order.dob),
		sexCode(order.sex),
	]);
}

function orderRecord(order: MachineOrder): string {
	const testField = joinAstmRepeats(
		order.tests.map((test) =>
			`^^^${escapeAstmText(toMaglumiDeviceCode(test))}`
		),
	);
	const fields: string[] = new Array(12).fill('');
	fields[0] = 'O';
	fields[1] = '1';
	fields[2] = escapeAstmText(order.sampleId);
	fields[4] = testField;
	fields[5] = 'R';
	fields[6] = nowStamp();
	fields[11] = 'A';
	return buildAstmRecord(fields);
}

export function buildMaglumiWorklistResponse(
	orders: readonly MachineOrder[],
	requestHeader?: AstmRecord,
): string[] {
	const records = [header(requestHeader)];
	for (const order of orders) {
		records.push(patientRecord(order), orderRecord(order));
	}
	records.push(buildAstmRecord(['L', '1', 'N']));
	return records;
}

export function buildMaglumiNoOrderResponse(
	requestHeader?: AstmRecord,
): string[] {
	return [header(requestHeader), buildAstmRecord(['L', '1', 'N'])];
}
