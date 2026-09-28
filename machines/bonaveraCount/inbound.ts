/**
 * Parse inbound HL7 v2.3.1 messages from the Bonavera Count hematology analyzer.
 *
 * This mirrors the proven Node.js friend setup:
 *   - ORU^R01 carries CBC results in OBX segments
 *   - QBP / QRY asks the LIS for an order by sample id
 *   - ACK confirms messages sent by the LIS
 */

import { BonaveraCountProtocol } from '../../protocols/hl7/variants/bonaveraCount.ts';
import type {
	MachineAnalyteResult,
	MachineResultEvent,
	MachineResultType,
} from '../../types.ts';

export interface ParsedCountHl7Message {
	kind: 'results' | 'query' | 'ack' | 'other';
	messageType: string;
	messageId: string;
	result?: MachineResultEvent;
	querySampleId?: string;
}

export function parseBonaveraCountHl7(raw: string): ParsedCountHl7Message {
	const normalized = raw.replace(/\n/g, '\r').replace(/\r\r+/g, '\r').trim();
	const msg = BonaveraCountProtocol.parseHl7Message(normalized);

	const trigger = BonaveraCountProtocol.getComponent(msg.messageType, 1);

	if (trigger === 'ORU') {
		return {
			kind: 'results',
			messageType: msg.messageType,
			messageId: msg.messageId,
			result: parseResults(normalized),
		};
	}

	if (trigger === 'QBP' || trigger === 'QRY') {
		return {
			kind: 'query',
			messageType: msg.messageType,
			messageId: msg.messageId,
			querySampleId: querySampleId(msg),
		};
	}

	if (trigger === 'ACK') {
		return {
			kind: 'ack',
			messageType: msg.messageType,
			messageId: msg.messageId,
		};
	}

	return {
		kind: 'other',
		messageType: msg.messageType,
		messageId: msg.messageId,
	};
}

function parseResults(raw: string): MachineResultEvent {
	const msg = BonaveraCountProtocol.parseHl7Message(raw);
	const pid = BonaveraCountProtocol.findSegment(msg, 'PID');
	const obr = BonaveraCountProtocol.findSegment(msg, 'OBR');
	const obxSegments = BonaveraCountProtocol.findSegments(msg, 'OBX');

	const patientId = pid
		? firstComponent(BonaveraCountProtocol.getField(pid, 3))
		: '';
	const patientName = pid
		? humanName(BonaveraCountProtocol.getField(pid, 5))
		: '';
	const sampleId = obr
		? firstComponent(BonaveraCountProtocol.getField(obr, 2)) ||
			firstComponent(BonaveraCountProtocol.getField(obr, 3))
		: '';

	return {
		sampleId: sampleId || patientId || patientName ||
			`UNKNOWN_${Date.now()}`,
		patientId: patientId || undefined,
		payload: { results: obxSegments.map(parseObx) },
		raw,
		receivedAt: new Date(),
	};
}

function parseObx(
	seg: { name: string; fields: string[] },
): MachineAnalyteResult {
	const testField = BonaveraCountProtocol.getField(seg, 3);
	const testId = firstComponent(testField);
	const testName = BonaveraCountProtocol.getComponent(testField, 2) || testId;
	const value = firstComponent(BonaveraCountProtocol.getField(seg, 5)) ||
		BonaveraCountProtocol.getField(seg, 5);
	const unit = BonaveraCountProtocol.getField(seg, 6);
	const parsedRange = parseRange(BonaveraCountProtocol.getField(seg, 7));
	const abnormal = firstComponent(BonaveraCountProtocol.getField(seg, 8));
	const status = firstComponent(BonaveraCountProtocol.getField(seg, 11)) ||
		'F';
	const completedAt = firstComponent(BonaveraCountProtocol.getField(seg, 14));

	return {
		assayNo: testId || testName,
		assayName: testName || undefined,
		resultType: (status === 'I' ? 'I' : 'F') as MachineResultType,
		value: value || undefined,
		unit: unit || undefined,
		lowReference: parsedRange?.low,
		highReference: parsedRange?.high,
		abnormalFlag: abnormal || 'N',
		status,
		completedAt: completedAt || undefined,
	};
}

function querySampleId(
	msg: ReturnType<typeof BonaveraCountProtocol.parseHl7Message>,
): string | undefined {
	const qpd = BonaveraCountProtocol.findSegment(msg, 'QPD');
	if (qpd) {
		const value = firstComponent(BonaveraCountProtocol.getField(qpd, 3));
		if (value && value !== '""') return value;
	}

	const qrd = BonaveraCountProtocol.findSegment(msg, 'QRD');
	if (qrd) {
		const value = firstComponent(BonaveraCountProtocol.getField(qrd, 8));
		if (value && value !== '""') return value;
	}

	return undefined;
}

function firstComponent(value: string): string {
	return BonaveraCountProtocol.getComponent(value, 1) || value;
}

function humanName(value: string): string {
	const parts = value.split('^').map((part) => part.trim()).filter(Boolean);
	return parts.length > 0 ? parts.join(' ') : value.trim();
}

function parseRange(
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
