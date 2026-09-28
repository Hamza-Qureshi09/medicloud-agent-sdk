import { BaseProtocol } from '../../abstracts/baseProtocol.ts';
import { MLLP } from './constants.ts';

export interface Hl7Segment {
	name: string;
	fields: string[];
}

export interface Hl7Message {
	segments: Hl7Segment[];
	raw: string;
	/** e.g. "ORU^R01" */
	messageType: string;
	/** MSH-10 */
	messageId: string;
	/** e.g. "2.3.1" */
	version: string;
	/** MSH-7 timestamp */
	timestamp: string;
}

/** MLLP framing only; message fields and responses belong to the machine. */
export class MllpProtocol extends BaseProtocol<string, string> {
	readonly protocolName = 'MLLP';
	protected readonly decoder = new TextDecoder('utf-8', { fatal: false });
	private readonly encoder = new TextEncoder();

	// Parsing

	static parseHl7Message(raw: string): Hl7Message {
		const segmentTexts = raw.split('\r').filter((s) => s.length > 0);
		const segments: Hl7Segment[] = segmentTexts.map((text) => {
			const fields = text.split('|');
			return { name: fields[0], fields };
		});

		const msh = segments.find((s) => s.name === 'MSH');
		return {
			segments,
			raw,
			messageType: msh ? MllpProtocol.getField(msh, 9) : '',
			messageId: msh ? MllpProtocol.getField(msh, 10) : '',
			version: msh ? MllpProtocol.getField(msh, 12) : '',
			timestamp: msh ? MllpProtocol.getField(msh, 7) : '',
		};
	}

	// Field access

	/**
	 * Get field N from a segment.
	 *
	 * MSH is special: MSH-1 = "|", MSH-2 = encoding chars, MSH-N (N>=2) lives at
	 * `fields[N-1]`.  For every other segment, field N lives at `fields[N]`.
	 */
	static getField(segment: Hl7Segment, fieldNum: number): string {
		if (segment.name === 'MSH') {
			if (fieldNum === 1) return '|';
			return segment.fields[fieldNum - 1] ?? '';
		}
		return segment.fields[fieldNum] ?? '';
	}

	/** Get component C (1-indexed) from a field value (^-separated). */
	static getComponent(fieldValue: string, componentNum: number): string {
		const parts = fieldValue.split('^');
		return parts[componentNum - 1] ?? '';
	}

	/** Split a field on the repetition separator (~). */
	static getRepetitions(fieldValue: string): string[] {
		return fieldValue.split('~');
	}

	// Segment lookup

	static findSegment(
		msg: Hl7Message,
		name: string,
	): Hl7Segment | undefined {
		return msg.segments.find((s) => s.name === name);
	}

	static findSegments(msg: Hl7Message, name: string): Hl7Segment[] {
		return msg.segments.filter((s) => s.name === name);
	}

	override send(message: string): Promise<void> {
		const payload = this.encoder.encode(message);
		const frame = new Uint8Array(payload.length + 3);
		frame[0] = MLLP.SB;
		frame.set(payload, 1);
		frame[payload.length + 1] = MLLP.EB;
		frame[payload.length + 2] = MLLP.CR;
		return this.writeBytes(frame);
	}

	protected override async processInput(): Promise<void> {
		while (true) {
			const start = this.input.indexOf(MLLP.SB);
			if (start === -1) break;
			if (start > 0) this.takeInput(start);
			const end = this.input.indexOf(MLLP.EB);
			if (end === -1) return;
			const payload = Uint8Array.from(this.input.slice(1, end));
			this.takeInput(end + 1 + (this.input[end + 1] === MLLP.CR ? 1 : 0));
			await this.deliverMessage(this.decoder.decode(payload));
		}
		await this.processUnframedInput();
		if (this.input.length > 64_000) {
			this.log.warn(
				'Raw buffer exceeded 64 KB without a complete message; clearing',
			);
			this.input.length = 0;
		}
	}

	protected processUnframedInput(): Promise<void> {
		return Promise.resolve();
	}
}
