import * as z from '@zod/zod';
import { BaseMachine } from '../../abstracts/baseMachine.ts';
import type { BaseProtocol } from '../../abstracts/baseProtocol.ts';
import type { AstmRecord } from '../../protocols/astm/records.ts';
import type {
	DriverConfigField,
	DriverTransportType,
	MachineConfig,
	MachineConfigSchema,
	MachineOrder,
	TransportSpec,
} from '../../types.ts';
import { delay } from '../../lib/utils.ts';
import { Maglumi800AstmProtocol } from '../../protocols/astm/variants/maglumi800.ts';
import { MachineCom } from '../../transports/machineCom.ts';
import { MAGLUMI_800_MODELS } from './catalog.ts';
import {
	parseMaglumiMessage,
	rawMaglumiRecords,
	toMachineResult,
} from './inbound.ts';
import {
	buildMaglumiNoOrderResponse,
	buildMaglumiWorklistResponse,
} from './outbound.ts';
import { maglumi800MachineId } from '../../lib/constants.ts';

export interface Maglumi800Config extends MachineConfig {
	host: string;
	port: number;
	queryReplyDelayMs?: number;
	traceProtocol?: boolean;
	framing?: 'numbered' | 'staged';
}

const DEFAULT_QUERY_REPLY_DELAY_MS = 0;
const DEFAULT_QUERY_ALL_LIMIT = 20;

export class Maglumi800 extends BaseMachine {
	static readonly id = maglumi800MachineId;
	static readonly brand = 'SNIBE MAGLUMI 800';
	static readonly protocol = { name: 'ASTM', version: 'E1394-97' } as const;
	static readonly transportType: DriverTransportType = 'tcp';
	static readonly models = MAGLUMI_800_MODELS;

	// for backend profile config before save
	static readonly configSchema = z.object({
		host: z.string().trim().min(1, 'Host is required'),
		port: z.number().int().min(1).max(65535),
		queryReplyDelayMs: z.number().int().min(0).optional(),
		traceProtocol: z.boolean().optional(),
		framing: z.enum(['numbered', 'staged']).optional(),
	}).strict() satisfies MachineConfigSchema<Maglumi800Config>;

	// for frontend fields generation
	static readonly configFields = [
		{
			key: 'framing',
			label: 'ASTM framing',
			type: 'select',
			required: false,
			default: 'numbered',
			options: [
				{ value: 'numbered', label: 'Numbered frames with checksum' },
				{
					value: 'staged',
					label: 'Staged handshake (manual section 16.6)',
				},
			],
			hint:
				'Use numbered for frames starting with 1H. Use staged for the separate STX/ACK handshake.',
		},
		{
			key: 'traceProtocol',
			label: 'Trace Maglumi protocol',
			type: 'boolean',
			required: false,
			default: false,
			hint:
				'Log raw communication bytes for LIS troubleshooting. Includes patient and sample data.',
		},
		{
			key: 'host',
			label: 'Host',
			type: 'string',
			required: true,
			default: '0.0.0.0',
			hint: 'IP address the analyzer connects to.',
		},
		{
			key: 'port',
			label: 'Port',
			type: 'number',
			required: true,
			default: 7001,
			hint: 'TCP port (1–65535).',
		},
		{
			key: 'queryReplyDelayMs',
			label: 'Query reply delay (ms)',
			type: 'number',
			required: false,
			default: 0,
			hint: 'Milliseconds to wait before replying to a query.',
		},
	] as const satisfies DriverConfigField[];

	readonly id = Maglumi800.id;
	readonly brand = Maglumi800.brand;
	readonly model = 'MAGLUMI 800';

	private configuration?: Maglumi800Config;
	private readonly pendingOrders = new Map<string, MachineOrder>();
	private readonly deliveredResults = new Set<string>();
	private protocol?: Maglumi800AstmProtocol;

	constructor() {
		super();
	}

	override configure(config: unknown): void {
		if (this.connected || this.running || this.com || this.protocol) {
			throw new Error(
				'MAGLUMI 800 cannot be reconfigured while it is active.',
			);
		}

		this.configuration = Maglumi800.configSchema.parse(config);
	}

	override async connect(): Promise<void> {
		if (this.connected) return;
		const config = this.requireConfiguration();

		const com = new MachineCom(this.transportSpec(config));
		this.com = com;
		await com.connect(); // start listening/open transport
		this.watchConnection(com);

		// initialize astm protocol
		this.protocol = new Maglumi800AstmProtocol(this.com, {
			framing: config.framing,
			traceProtocol: config.traceProtocol,
			loggerScope: 'Maglumi800:ASTM',
			onMessage: (records, protocol, context) =>
				this.handleAstmMessage(
					records,
					protocol,
					context.remoteAddr,
				),
			onError: (error) => this.handleError(error),
			onClose: () => {
				this.markStopped();
				if (this.connected) this.markDisconnected();
			},
		});
	}

	override async start(): Promise<void> {
		if (!this.protocol) {
			throw new Error(
				'MAGLUMI 800 protocol is not initialized. Call connect() first.',
			);
		}

		await this.protocol.start();
		this.markStarted();
	}

	override async shutdown(): Promise<void> {
		const protocol = this.protocol;
		this.protocol = undefined;

		if (protocol) {
			protocol.close();
			await protocol.waitUntilClosed().catch((error) =>
				this.handleError(error)
			);
		} else if (this.com) {
			try {
				this.com.close();
			} catch {
				// Already closed or never connected.
			}
		}

		this.com = undefined;
		this.pendingOrders.clear();
		this.deliveredResults.clear();
		this.markStopped();
		if (this.connected) this.markDisconnected();
	}

	override async sendOrder(order: MachineOrder): Promise<void> {
		this.assertOrder(order);

		this.pendingOrders.set(order.sampleId, {
			...order,
			status: order.status ?? 'pending',
		});
		return Promise.resolve();
	}

	override removeOrder(sampleId: string): Promise<void> {
		this.pendingOrders.delete(sampleId);
		return Promise.resolve();
	}

	// private helpers
	private requireConfiguration(): Maglumi800Config {
		if (!this.configuration) {
			throw new Error(
				'MAGLUMI 800 is not configured. Call configure() before connect().',
			);
		}
		return this.configuration;
	}

	private transportSpec(config: Maglumi800Config): TransportSpec {
		return {
			kind: 'tcp-server',
			host: config.host,
			port: config.port,
		};
	}

	// to delay markConnected() until real analyzer connection exists.
	private watchConnection(com: MachineCom): void {
		void com.whenConnected().then(() => {
			if (this.com === com && !this.connected) this.markConnected();
		}).catch((error) => {
			if (this.com === com) void this.handleError(error);
		});
	}

	private async handleError(error: unknown): Promise<void> {
		const normalized = error instanceof Error
			? error
			: new Error(String(error));
		await this.emit('error', normalized);
	}

	private assertOrder(order: MachineOrder): void {
		if (order.sampleId.trim() === '') {
			throw new Error('MAGLUMI 800 order sampleId is required.');
		}

		if (order.tests.length === 0) {
			throw new Error(
				`MAGLUMI 800 order "${order.sampleId}" has no tests.`,
			);
		}

		for (const testCode of order.tests) {
			if (testCode.trim() === '') {
				throw new Error(
					`MAGLUMI 800 order "${order.sampleId}" has an empty test code.`,
				);
			}
		}
	}

	private findOrdersForQuery(
		sampleId: string,
		queryAll: boolean,
	): MachineOrder[] {
		if (queryAll && sampleId === '') {
			// filters expired Maglumi query-all orders before sending.
			return Array.from(this.pendingOrders.values())
				.filter((order) =>
					order.status !== 'testing' && !this.isExpiredOrder(order)
				)
				.slice(0, DEFAULT_QUERY_ALL_LIMIT);
		}

		const order = sampleId ? this.pendingOrders.get(sampleId) : undefined;
		return order && !this.isExpiredOrder(order) ? [order] : [];
	}

	private toTestingOrder(
		order: MachineOrder,
		startedAt: Date,
	): MachineOrder {
		const estimatedDurationMinutes = order.estimatedDurationMinutes;

		return {
			...order,
			status: 'testing',
			sentAt: startedAt,
			startedAt,
			estimatedDurationMinutes,
			estimatedCompletionAt: estimatedDurationMinutes === undefined
				? undefined
				: new Date(
					startedAt.getTime() + estimatedDurationMinutes * 60_000,
				),
		};
	}

	private delayBeforeQueryReply(): Promise<void> {
		const delayMs = this.requireConfiguration().queryReplyDelayMs ??
			DEFAULT_QUERY_REPLY_DELAY_MS;
		return delay(delayMs);
	}

	private resultKey(sampleId: string, raw: string): string {
		return `${sampleId}\0${raw}`;
	}

	private isExpiredOrder(order: MachineOrder): boolean {
		return order.expiresAt.getTime() <= Date.now();
	}

	private remoteAddressName(
		addr: Deno.Addr | undefined,
		fallback: string,
	): string {
		const netAddr = addr as Partial<Deno.NetAddr> | undefined;
		if (
			typeof netAddr?.hostname === 'string' && netAddr.hostname.length > 0
		) {
			return netAddr.hostname;
		}

		return fallback;
	}

	private async handleAstmMessage(
		records: Parameters<typeof rawMaglumiRecords>[0],
		protocol: BaseProtocol<AstmRecord[], string[]>,
		remoteAddr?: Deno.Addr,
	): Promise<void> {
		const raw = rawMaglumiRecords(records);
		const address = this.remoteAddressName(remoteAddr, protocol.remoteName);
		const parsed = parseMaglumiMessage(records, address, raw);

		if (parsed.kind === 'query') {
			const sampleId = parsed.querySampleId ?? '';
			const requestHeader = records.find((record) => record.type === 'H');
			await this.emit('order-query', { sampleId, raw });

			const orders = this.findOrdersForQuery(
				sampleId,
				parsed.queryAll === true,
			);
			if (orders.length === 0) {
				await this.delayBeforeQueryReply();
				await protocol.send(buildMaglumiNoOrderResponse(requestHeader));
				return;
			}

			const response = buildMaglumiWorklistResponse(
				orders,
				requestHeader,
			);
			await this.delayBeforeQueryReply();
			await protocol.send(response);

			const startedAt = new Date();
			for (const order of orders) {
				const sentOrder = this.toTestingOrder(order, startedAt);
				this.pendingOrders.set(sentOrder.sampleId, sentOrder);
				await this.emit('order-sent', {
					order: sentOrder,
					raw: response,
				});
			}
			return;
		}

		if (parsed.kind === 'results' && parsed.result) {
			const result = toMachineResult(parsed.result);
			const resultKey = this.resultKey(result.sampleId, result.raw ?? '');
			if (this.deliveredResults.has(resultKey)) return;

			this.deliveredResults.add(resultKey);
			try {
				await this.emit('result', result);
				this.pendingOrders.delete(result.sampleId);
			} catch (error) {
				this.deliveredResults.delete(resultKey);
				throw error;
			}
		}
	}
}
