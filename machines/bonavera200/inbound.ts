import { Bonavera200Protocol } from '../../protocols/hl7/variants/bonavera200.ts';
import type { Hl7Segment } from '../../protocols/hl7/link.ts';
import type {
	MachineAnalyteResult,
	MachineResultEvent,
	MachineResultType,
} from '../../types.ts';

export interface ParsedBonavera200Message {
	kind: 'results' | 'query' | 'other';
	messageType: string;
	messageId: string;
	result?: MachineResultEvent;
	querySampleId?: string;
	rawQrd?: string;
	rawQrf?: string;
}

function parseObx(segment: Hl7Segment): MachineAnalyteResult {
	const field = Bonavera200Protocol.getField;
	const testId = field(segment, 3);
	const testName = field(segment, 4);
	const value = field(segment, 5);
	const unit = field(segment, 6);
	const refRange = field(segment, 7);
	const abnormal = field(segment, 8);
	const status = field(segment, 11);
	const datetime = field(segment, 14);
	let low: string | undefined;
	let high: string | undefined;
	if (refRange && refRange.includes('-')) {
		const dashIdx = refRange.indexOf('-', refRange.startsWith('-') ? 1 : 0);
		if (dashIdx > 0) {
			low = refRange.slice(0, dashIdx);
			high = refRange.slice(dashIdx + 1);
		}
	}
	return {
		assayNo: testId,
		assayName: testName || undefined,
		resultType: (status === 'I' ? 'I' : 'F') as MachineResultType,
		value: value || undefined,
		unit: unit || undefined,
		lowReference: low,
		highReference: high,
		abnormalFlag: abnormal || undefined,
		status: status || undefined,
		completedAt: datetime || undefined,
	};
}

export function parseBonavera200Hl7(raw: string): ParsedBonavera200Message {
	const msg = Bonavera200Protocol.parseHl7Message(raw);
	const field = Bonavera200Protocol.getField;
	const component = Bonavera200Protocol.getComponent;
	const trigger = component(msg.messageType, 1);
	const basic = { messageType: msg.messageType, messageId: msg.messageId };

	if (trigger === 'ORU') {
		const pid = Bonavera200Protocol.findSegment(msg, 'PID');
		const obr = Bonavera200Protocol.findSegment(msg, 'OBR');
		const sampleId = obr ? field(obr, 2) || field(obr, 3) : '';
		let patientId = pid ? field(pid, 3) : '';
		if (patientId === '""' || patientId === '') {
			patientId = pid ? field(pid, 2) : '';
		}
		const patientName = pid ? field(pid, 5) : undefined;
		return {
			kind: 'results',
			...basic,
			result: {
				sampleId,
				patientId: patientId && patientId !== '""'
					? patientId
					: patientName || undefined,
				payload: {
					results: Bonavera200Protocol.findSegments(msg, 'OBX').map(
						parseObx,
					),
				},
				raw,
				receivedAt: new Date(),
			},
		};
	}

	if (trigger === 'QRY') {
		const qrd = Bonavera200Protocol.findSegment(msg, 'QRD');
		const qrf = Bonavera200Protocol.findSegment(msg, 'QRF');
		const whoFilter = qrd ? field(qrd, 8) : '';
		const querySampleId = component(whoFilter, 1);
		return {
			kind: 'query',
			...basic,
			querySampleId: querySampleId !== '""' ? querySampleId : undefined,
			rawQrd: qrd ? qrd.fields.join('|') : undefined,
			rawQrf: qrf ? qrf.fields.join('|') : undefined,
		};
	}

	return { kind: 'other', ...basic };
}
