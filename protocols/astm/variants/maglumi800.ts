import {
	BaseProtocol,
	type BaseProtocolOptions,
	type ProtocolConnection,
} from '../../../abstracts/baseProtocol.ts';
import { ASTM_CONTROL } from '../constants.ts';
import { type AstmRecord, parseAstmRecord } from '../records.ts';

export interface Maglumi800AstmOptions
	extends BaseProtocolOptions<AstmRecord[], string[]> {
	readonly ackTimeoutMs?: number;
	readonly traceProtocol?: boolean;
}

type ReceivePhase = 'idle' | 'records' | 'etx' | 'eot';
type SendStage = 'ENQ' | 'STX' | 'records' | 'ETX' | 'EOT';

const DEFAULT_ACK_TIMEOUT_MS = 15_000;
const MAX_SEND_ATTEMPTS = 6;
const MAX_MESSAGE_BYTES = 1_048_576;

// Maglumi manual section 16.6 requires a separate ACK at each transfer stage.
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

	constructor(
		connection: ProtocolConnection,
		options: Maglumi800AstmOptions = {},
	) {
		super(connection, options);
		this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
		this.traceProtocol = options.traceProtocol ?? false;
		if (!Number.isFinite(this.ackTimeoutMs) || this.ackTimeoutMs <= 0) {
			throw new Error('Maglumi ACK timeout must be a positive number.');
		}
	}

	override send(recordLines: string[]): Promise<void> {
		return this.serializeSend(async () => {
			await this.exchange(Uint8Array.of(ASTM_CONTROL.ENQ), 'ENQ');
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

	private resetReceive(): void {
		this.receivePhase = 'idle';
		this.records = [];
		this.receivedBytes = 0;
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
