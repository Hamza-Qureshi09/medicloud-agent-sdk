/**
 * Build outbound HL7 v2.3.1 messages for the Bonavera 200.
 *
 * Flow: analyzer -> QRY^Q02 -> LIS replies QCK^Q02, then DSR^Q03.
 * DSR echoes QRD/QRF verbatim and carries sample data in fixed DSP line
 * numbers. In the chemistry analyzer manuals:
 *   DSP 21 = sample barcode
 *   DSP 22 = numeric sample no / sample ID, must be greater than zero
 *   DSP 29+ = ordered test numbers as "testNo^^^"
 */

import type { MachineOrder } from '../../types.ts';

export type QueryStatus = 'OK' | 'NF' | 'AE' | 'AR';

let msgSeq = 0;

function nowStamp(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
		`${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
	);
}

function nextId(): string {
	return String(++msgSeq);
}

function msh(messageType: string, acceptAckType = ''): string {
	const fields = new Array(20).fill('');
	fields[0] = 'MSH';
	fields[1] = '^~\\&';
	fields[6] = nowStamp();
	fields[8] = messageType;
	fields[9] = nextId();
	fields[10] = 'P';
	fields[11] = '2.3.1';
	fields[14] = acceptAckType;
	fields[17] = 'UNICODE';
	return fields.join('|');
}

function msa(
	originalMsgId: string,
	ackCode: 'AA' | 'AE' | 'AR' = 'AA',
): string {
	const text = ackCode === 'AA' ? 'Message accepted' : 'Message rejected';
	return `MSA|${ackCode}|${originalMsgId}|${text}|||0|`;
}

function clean(value: string): string {
	return value.replace(/[\r\n|]/g, ' ').trim();
}

function dsp(setId: number, value = ''): string {
	return `DSP|${setId}||${clean(value)}|||`;
}

function dob(value?: string): string {
	const digits = (value ?? '').replace(/\D/g, '');
	if (digits.length >= 14) return digits.slice(0, 14);
	if (digits.length === 8) return `${digits}000000`;
	return '';
}

function sex(value?: string): string {
	const normalized = (value ?? '').trim().toUpperCase();
	if (normalized.startsWith('M')) return 'M';
	if (normalized.startsWith('F')) return 'F';
	if (normalized.startsWith('O')) return 'O';
	return '';
}

function sampleType(value?: string): string {
	const normalized = (value ?? 'serum').trim().toLowerCase();
	if (normalized.startsWith('plas')) return 'plasma';
	if (normalized.startsWith('ur')) return 'urine';
	return 'serum';
}

function positiveIntFrom(value?: string): string | undefined {
	const match = (value ?? '').match(/\d+/);
	if (!match) return undefined;
	const parsed = Number.parseInt(match[0], 10);
	return parsed > 0 ? String(parsed) : undefined;
}

function sampleNo(order: MachineOrder): string {
	return positiveIntFrom(order.sampleId) ??
		positiveIntFrom(order.patientId) ?? '1';
}

export function buildAck(
	originalMsgId: string,
	ackCode: 'AA' | 'AE' | 'AR' = 'AA',
	triggerEvent = 'R01',
): string {
	return [
		msh(`ACK^${triggerEvent}`),
		msa(originalMsgId, ackCode),
		'ERR|0',
	].join('\r') + '\r';
}

export function buildQck(originalMsgId: string, status: QueryStatus): string {
	return [
		msh('QCK^Q02'),
		msa(originalMsgId),
		'ERR|0',
		`QAK|SR|${status}`,
	].join('\r') + '\r';
}

export function buildDsrWithOrder(
	originalMsgId: string,
	order: MachineOrder,
	rawQrd?: string,
	rawQrf?: string,
	continuationPointer = '',
): string {
	const segments: string[] = [
		msh('DSR^Q03', 'P'),
		msa(originalMsgId),
		'ERR|0',
		'QAK|SR|OK',
	];

	if (rawQrd) segments.push(rawQrd);
	if (rawQrf) segments.push(rawQrf);

	const sampleFields = new Map<number, string>([
		[1, order.patientId ?? ''],
		[3, order.patientName ?? ''],
		[4, dob(order.dob)],
		[5, sex(order.sex)],
		[21, order.sampleId],
		[22, sampleNo(order)],
		[23, nowStamp()],
		[24, 'N'],
		[25, '1'],
		[26, sampleType(order.sampleType)],
	]);

	for (let i = 1; i <= 28; i++) {
		segments.push(dsp(i, sampleFields.get(i) ?? ''));
	}

	for (let i = 0; i < order.tests.length; i++) {
		const testNo = clean(order.tests[i]).split('^')[0].trim();
		if (testNo === '') continue;
		segments.push(dsp(29 + i, `${testNo}^^^`));
	}

	segments.push(`DSC|${continuationPointer}|`);

	return segments.join('\r') + '\r';
}
