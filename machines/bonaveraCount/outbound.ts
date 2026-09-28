/**
 * Build outbound HL7 v2.3.1 messages for the Bonavera Count hematology analyzer.
 *
 * These message shapes intentionally follow the working Node.js setup supplied
 * for this analyzer: ACK^R01 for result acknowledgements, RSP^K11 for order
 * queries, and ORM^O01 when pushing an order to an already connected analyzer.
 */

import type { MachineOrder } from '../../types.ts';

export type AckCode = 'AA' | 'AE' | 'AR';

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
	msgSeq = (msgSeq + 1) % 1_000_000;
	return `BC${nowStamp()}${String(msgSeq).padStart(6, '0')}`;
}

function clean(value?: string): string {
	return (value ?? '').replace(/[\r\n|]/g, ' ').trim();
}

function dob(value?: string): string {
	const digits = (value ?? '').replace(/\D/g, '');
	return digits.length >= 8 ? digits.slice(0, 8) : clean(value);
}

function sex(value?: string): string {
	const normalized = (value ?? '').trim().toUpperCase();
	if (normalized.startsWith('M')) return 'M';
	if (normalized.startsWith('F')) return 'F';
	if (normalized.startsWith('O')) return 'O';
	return clean(value);
}

function msh(messageType: string): string {
	return [
		'MSH',
		'^~\\&',
		'BonaveraCountLIS',
		'HOSPITAL',
		'BONAVERA',
		'LAB',
		nowStamp(),
		'',
		messageType,
		nextId(),
		'P',
		'2.3.1',
	].join('|');
}

function pid(order: MachineOrder): string {
	return [
		'PID',
		'1',
		'',
		clean(order.patientId),
		'',
		clean(order.patientName ?? ''),
		'',
		dob(order.dob),
		sex(order.sex),
	].join('|');
}

function obr(order: MachineOrder): string {
	return [
		'OBR',
		'1',
		clean(order.sampleId),
		'',
		'CBC^Complete Blood Count',
		'',
		'',
		nowStamp(),
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'',
		'F',
	].join('|');
}

export function buildAck(
	originalMsgId: string,
	ackCode: AckCode = 'AA',
	text = 'Message accepted',
): string {
	return [
		msh('ACK^R01'),
		`MSA|${ackCode}|${clean(originalMsgId)}|${clean(text)}`,
	].join('\r') + '\r';
}

export function buildQueryResponse(
	originalMsgId: string,
	order: MachineOrder | null,
): string {
	const segments = [
		msh('RSP^K11'),
		`MSA|AA|${clean(originalMsgId)}`,
		`QAK|${clean(originalMsgId)}|${order ? 'OK' : 'NF'}|`,
	];

	if (order) {
		segments.push(pid(order), obr(order));
	}

	return segments.join('\r') + '\r';
}

export function buildOrm(order: MachineOrder): string {
	return [
		msh('ORM^O01'),
		pid(order),
		obr(order),
	].join('\r') + '\r';
}
