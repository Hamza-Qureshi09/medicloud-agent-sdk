import {
	BaseProtocol,
	type BaseProtocolOptions,
	type ProtocolConnection,
} from '../../../abstracts/baseProtocol.ts';
import { ASTM_CONTROL } from '../constants.ts';
import { computeAstmChecksum } from '../checksum.ts';
import { type AstmRecord, parseAstmRecord } from '../records.ts';

export interface Maglumi800AstmOptions
	extends BaseProtocolOptions<AstmRecord[], string[]> {
	readonly ackTimeoutMs?: number;
	readonly traceProtocol?: boolean;
	/** Numbered/checksummed frames, or the staged handshake in manual 16.6. */
	readonly framing?: 'numbered' | 'staged';
}

type ReceivePhase = 'idle' | 'records' | 'etx' | 'eot';
type SendStage = 'ENQ' | 'STX' | 'records' | 'ETX' | 'EOT';

const DEFAULT_ACK_TIMEOUT_MS = 15_000;
const MAX_SEND_ATTEMPTS = 6;
const MAX_MESSAGE_BYTES = 1_048_576;

// Firmware in the field also uses numbered ASTM frames, unlike manual 16.6.
export class Maglumi800AstmProtocol
	extends BaseProtocol<AstmRecord[], string[]> {
	readonly protocolName = 'ASTM';
	override readonly protocolVersion = 'maglumi800-e1394';

	private readonly decoder = new TextDecoder();
	private readonly encoder = new TextEncoder();
	private readonly ackTimeoutMs: number;
	private readonly traceProtocol: boolean;
	private receivePhase: ReceivePhase = 'idle';
	private records: AstmRecord[] = [];
	private receivedBytes = 0;
	private pendingReply?: (reply: number | Error) => void;
	private readonly framing: 'numbered' | 'staged';
	private frameText = '';
	private readonly frameDecoder = new TextDecoder();
	private expectedFrame = 1;
	private lastFrame?: string;

	constructor(
		connection: ProtocolConnection,
		options: Maglumi800AstmOptions = {},
	) {
		super(connection, options);
		this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
		this.traceProtocol = options.traceProtocol ?? false;
		this.framing = options.framing ?? 'numbered';
		if (!Number.isFinite(this.ackTimeoutMs) || this.ackTimeoutMs <= 0) {
			throw new Error('Maglumi ACK timeout must be a positive number.');
		}
	}

	override send(recordLines: string[]): Promise<void> {
		return this.serializeSend(async () => {
			await this.exchange(Uint8Array.of(ASTM_CONTROL.ENQ), 'ENQ');
			if (this.framing === 'numbered') {
				let frameNumber = 1;
				for (const line of recordLines) {
					const text = this.encoder.encode(`${line}\r`);
					// ASTM text blocks contain at most 240 bytes.
					for (let offset = 0; offset < text.length; offset += 240) {
						const terminator = offset + 240 < text.length
							? ASTM_CONTROL.ETB
							: ASTM_CONTROL.ETX;
						const body = Uint8Array.from([
							0x30 + frameNumber,
							...text.slice(offset, offset + 240),
							terminator,
						]);
						await this.exchange(
							Uint8Array.from([
								ASTM_CONTROL.STX,
								...body,
								...this.encoder.encode(
									computeAstmChecksum(body),
								),
								ASTM_CONTROL.CR,
								ASTM_CONTROL.LF,
							]),
							'records',
						);
						frameNumber = (frameNumber + 1) % 8;
					}
				}
				await this.writeControl(ASTM_CONTROL.EOT);
				return;
			}
			await this.exchange(Uint8Array.of(ASTM_CONTROL.STX), 'STX');
			await this.exchange(
				this.encoder.encode(`${recordLines.join('\r')}\r`),
				'records',
			);
			await this.exchange(Uint8Array.of(ASTM_CONTROL.ETX), 'ETX');
			await this.exchange(Uint8Array.of(ASTM_CONTROL.EOT), 'EOT');
		});
	}

	override close(): void {
		this.pendingReply?.(new Error('Maglumi connection closed before ACK.'));
		this.resetReceive();
		super.close();
	}

	protected override async handleReadBytes(bytes: Uint8Array): Promise<void> {
		this.traceBytes('RX', bytes);
		await super.handleReadBytes(bytes);
	}

	protected override async writeBytes(bytes: Uint8Array): Promise<void> {
		this.traceBytes('TX', bytes);
		await super.writeBytes(bytes);
	}

	private traceBytes(direction: 'RX' | 'TX', bytes: Uint8Array): void {
		if (!this.traceProtocol) return;
		const hex = Array.from(
			bytes,
			(byte) => byte.toString(16).padStart(2, '0'),
		).join(' ');
		this.log.debug(`Maglumi ${direction} ${bytes.length} bytes: ${hex}`);
	}

	protected override async processInput(): Promise<void> {
		if (this.framing === 'numbered') {
			await this.processNumberedInput();
			return;
		}
		while (this.bufferedByteLength > 0) {
			const byte = this.peekByte();
			if (byte === ASTM_CONTROL.ACK || byte === ASTM_CONTROL.NAK) {
				this.shiftByte();
				this.pendingReply?.(byte);
				continue;
			}
			if (byte === ASTM_CONTROL.ENQ) {
				this.shiftByte();
				this.resetReceive();
				await this.writeControl(ASTM_CONTROL.ACK);
				continue;
			}
			if (byte === ASTM_CONTROL.STX) {
				this.shiftByte();
				this.resetReceive();
				this.receivePhase = 'records';
				await this.writeControl(ASTM_CONTROL.ACK);
				continue;
			}
			if (byte === ASTM_CONTROL.ETX) {
				this.shiftByte();
				if (this.receivePhase !== 'etx') {
					throw new Error(
						`Maglumi ETX arrived before a complete L record. Received record types: ${
							JSON.stringify(this.records.map((record) =>
								record.type.slice(0, 16)
							))
						}.`,
					);
				}
				this.receivePhase = 'eot';
				await this.writeControl(ASTM_CONTROL.ACK);
				continue;
			}
			if (byte === ASTM_CONTROL.EOT) {
				this.shiftByte();
				if (this.receivePhase !== 'eot') {
					throw new Error('Maglumi EOT arrived before ETX.');
				}
				const records = this.records;
				this.resetReceive();
				await this.writeControl(ASTM_CONTROL.ACK);
				this.publishMessage(records);
				continue;
			}
			if (byte === ASTM_CONTROL.CR || byte === ASTM_CONTROL.LF) {
				this.shiftByte();
				continue;
			}
			if (this.receivePhase !== 'records') {
				throw new Error(
					'Maglumi record data arrived outside STX and ETX.',
				);
			}
			if (!await this.readRecord()) return;
		}
	}

	private async readRecord(): Promise<boolean> {
		const end = this.input.findIndex((byte) =>
			byte === ASTM_CONTROL.CR || byte === ASTM_CONTROL.ETX ||
			byte === ASTM_CONTROL.EOT
		);
		const availableBytes = end < 0 ? this.bufferedByteLength : end + 1;
		if (this.receivedBytes + availableBytes > MAX_MESSAGE_BYTES) {
			throw new Error('Maglumi message exceeds the receive limit.');
		}
		if (end < 0) return false;
		const terminator = this.peekByte(end);
		const bytes = Uint8Array.from(this.input.slice(0, end));
		const record = parseAstmRecord(this.decoder.decode(bytes).trim());
		if (
			terminator !== ASTM_CONTROL.CR &&
			!(terminator === ASTM_CONTROL.ETX && record.type === 'L')
		) {
			throw new Error('Maglumi record is missing its CR terminator.');
		}

		const consumed = end + (terminator === ASTM_CONTROL.CR ? 1 : 0);
		this.takeInput(consumed);
		this.receivedBytes += consumed;
		this.records.push(record);
		if (record.type === 'L') {
			this.receivePhase = 'etx';
			if (terminator === ASTM_CONTROL.CR) {
				await this.writeControl(ASTM_CONTROL.ACK);
			}
		}
		return true;
	}

	private async processNumberedInput(): Promise<void> {
		while (this.bufferedByteLength > 0) {
			const byte = this.peekByte();
			if (byte === ASTM_CONTROL.STX) {
				if (!await this.readNumberedFrame()) return;
				continue;
			}
			this.shiftByte();
			if (byte === ASTM_CONTROL.ACK || byte === ASTM_CONTROL.NAK) {
				this.pendingReply?.(byte);
			} else if (byte === ASTM_CONTROL.ENQ) {
				this.resetReceive();
				await this.writeControl(ASTM_CONTROL.ACK);
			} else if (byte === ASTM_CONTROL.EOT) {
				const records = this.records;
				const complete = this.frameText === '' &&
					records[0]?.type === 'H' &&
					records.at(-1)?.type === 'L';
				this.resetReceive();
				if (complete) this.publishMessage(records);
				else if (records.length > 0) {
					await this.reportError(
						new Error(
							'Maglumi incomplete ASTM message at EOT; discarded.',
						),
					);
				}
			} else if (byte !== ASTM_CONTROL.CR && byte !== ASTM_CONTROL.LF) {
				await this.writeControl(ASTM_CONTROL.NAK);
			}
		}
	}

	private async readNumberedFrame(): Promise<boolean> {
		const end = this.input.findIndex((byte) =>
			byte === ASTM_CONTROL.ETX || byte === ASTM_CONTROL.ETB
		);
		if (
			this.receivedBytes + (end < 0 ? this.bufferedByteLength : end + 5) >
				MAX_MESSAGE_BYTES
		) {
			throw new Error('Maglumi message exceeds the receive limit.');
		}
		// Keep STX buffered until the frame number, checksum and CR/LF all arrive.
		if (end < 0 || this.bufferedByteLength < end + 5) return false;
		const frame = this.takeInput(end + 5);
		const number = frame[1] - 0x30;
		const checksum = this.decoder.decode(
			Uint8Array.from(frame.slice(end + 1, end + 3)),
		);
		const expected = computeAstmChecksum(
			Uint8Array.from(frame.slice(1, end + 1)),
		);
		if (
			number < 0 || number > 7 || checksum.toUpperCase() !== expected ||
			frame[end + 3] !== ASTM_CONTROL.CR ||
			frame[end + 4] !== ASTM_CONTROL.LF
		) {
			await this.writeControl(ASTM_CONTROL.NAK);
			return true;
		}
		const signature = frame.join(',');
		// A lost ACK may cause an exact retransmission; acknowledge without duplicating data.
		if (signature === this.lastFrame) {
			await this.writeControl(ASTM_CONTROL.ACK);
			return true;
		}
		if (number !== this.expectedFrame) {
			await this.writeControl(ASTM_CONTROL.NAK);
			return true;
		}
		this.receivedBytes += frame.length;
		this.expectedFrame = (number + 1) % 8;
		this.lastFrame = signature;
		this.frameText += this.frameDecoder.decode(
			Uint8Array.from(frame.slice(2, end)),
			{
				stream: frame[end] === ASTM_CONTROL.ETB,
			},
		);
		if (frame[end] === ASTM_CONTROL.ETX) {
			for (const line of this.frameText.split(/\r\n|\r|\n/)) {
				if (line.length > 0) this.records.push(parseAstmRecord(line));
			}
			this.frameText = '';
		}
		await this.writeControl(ASTM_CONTROL.ACK);
		return true;
	}

	private resetReceive(): void {
		this.receivePhase = 'idle';
		this.records = [];
		this.receivedBytes = 0;
		this.frameText = '';
		this.expectedFrame = 1;
		this.lastFrame = undefined;
		this.frameDecoder.decode();
	}

	private async exchange(bytes: Uint8Array, stage: SendStage): Promise<void> {
		for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
			const reply = await this.writeAndWaitForReply(bytes, stage);
			if (reply === ASTM_CONTROL.ACK) return;
		}
		throw new Error(
			`Maglumi rejected ${stage} after ${MAX_SEND_ATTEMPTS} attempts.`,
		);
	}

	private writeAndWaitForReply(
		bytes: Uint8Array,
		stage: SendStage,
	): Promise<number> {
		if (this.isClosed) {
			return Promise.reject(new Error('Maglumi protocol is closed.'));
		}
		return new Promise((resolve, reject) => {
			const finish = (reply: number | Error) => {
				if (this.pendingReply !== finish) return;
				this.pendingReply = undefined;
				clearTimeout(timer);
				if (reply instanceof Error) reject(reply);
				else resolve(reply);
			};
			const timer = setTimeout(() => {
				finish(new Error(`Maglumi ACK timeout after ${stage}.`));
			}, this.ackTimeoutMs);
			// Install the waiter before writing so an immediate peer ACK is not lost.
			this.pendingReply = finish;
			void this.writeBytes(bytes).catch((cause) => {
				finish(
					cause instanceof Error ? cause : new Error(String(cause)),
				);
			});
		});
	}
}
