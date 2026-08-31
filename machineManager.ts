import './machines/mod.ts';
import {
	IMachineManager,
	MachineManagerHandler,
	MachineManagerOptions,
} from './types.ts';
import { MachineRegistry, machineRegistry } from './registry.ts';
import { createLogger, type Logger } from './lib/logger.ts';
import { createMachineManagerHandler } from './http/routes.ts';

export class MachineManager implements IMachineManager {
	private readonly registry: MachineRegistry;
	private readonly http: MachineManagerOptions['http'];
	private readonly log: Logger = createLogger('Machine-Manager');
	private httpServer?: ReturnType<typeof Deno.serve>;
	private started = false;
	private listenPromise?: Promise<void>;
	private shutdownPromise?: Promise<void>;

	constructor(options: MachineManagerOptions = {}) {
		this.registry = machineRegistry;
		this.registry.configure({
			dbPath: options.dbPath ?? './data/machines.db',
			// Forward the hook so the registry can fire it after each persist.
			onResultPersisted: options.onResultPersisted,
		});
		this.http = {
			enabled: options.http?.enabled ?? true,
			host: options.http?.host ?? '127.0.0.1',
			port: options.http?.port ?? 8080,
		};
	}

	/**
	 * will initialize the shared db
	 * start every enabled/active profiles machines
	 * start httpServer
	 * allow callback to run when http is enabled
	 *
	 * @param callback
	 */
	async listen(
		callback?: () => void | Promise<void>,
	): Promise<void> {
		if (this.started) return Promise.resolve();
		if (this.listenPromise) return this.listenPromise;

		const operation = this.startListening(callback);
		this.listenPromise = operation;

		void operation.finally(() => {
			if (this.listenPromise === operation) {
				this.listenPromise = undefined;
			}
		}).catch(() => undefined);

		return operation;
	}

	async shutdown(): Promise<void> {
		if (this.shutdownPromise) return this.shutdownPromise;

		const operation = this.performShutdown();
		this.shutdownPromise = operation;

		void operation.finally(() => {
			if (this.shutdownPromise === operation) {
				this.shutdownPromise = undefined;
			}
		}).catch(() => undefined);

		return operation;
	}

	/**
	 * Initialize the registry and return a standard Fetch API handler. Any
	 * framework capable of forwarding Request and Response can host this SDK.
	 */
	async getHandler(): Promise<MachineManagerHandler> {
		// connecte registry to shared sqlite db before loading profiles.
		await this.registry.connectDatabase();

		// list of enabled profiles from db
		const enabledProfiles = await this.registry.listEnabledProfiles();

		// start all enabled profiles
		await this.registry.startProfiles(enabledProfiles);

		return createMachineManagerHandler({
			registry: this.registry,
		});
	}

	// private helpers
	private async startListening(
		callback?: () => void | Promise<void>,
	): Promise<void> {
		try {
			// setup deno server
			this.startHttpServer(await this.getHandler());

			// run callback
			if (this.http?.enabled) {
				await callback?.();
			}

			// update state
			this.started = true;
		} catch (error) {
			// stop profile & close db
			await this.registry.shutdown().catch((shutdownError) => {
				this.log.error('registry rollback failed', shutdownError);
			});
			throw error;
		}
	}

	private async performShutdown(): Promise<void> {
		// stop httpServer
		await this.stopHttpServer();

		// stop profile & close db
		await this.registry.shutdown();

		this.started = false;
	}

	private startHttpServer(
		handler: (req: Request) => Promise<Response>,
	): void {
		if (this.httpServer || !this.http?.enabled) return;

		this.httpServer = Deno.serve(
			{
				hostname: this.http.host,
				port: this.http.port,
				onListen: ({ hostname, port }) => {
					this.log.info(
						`HTTP server listening on http://${hostname}:${port}`,
					);
				},
			},
			handler,
		);
	}

	private async stopHttpServer(): Promise<void> {
		const server = this.httpServer;
		this.httpServer = undefined;
		await server?.shutdown();
	}
}
