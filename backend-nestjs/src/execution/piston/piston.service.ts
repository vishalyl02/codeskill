import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { RedisService } from '../../redis/redis.service';
import { canonicalLanguage } from '../execution.types';
import { ProviderPool } from '../providers/provider-pool';
import { pistonConfig } from './piston.config';
import {
  PistonRequest,
  PistonResponse,
  PistonRuntime,
  PistonStage,
  PistonUnavailableError,
} from './piston.types';

@Injectable()
export class PistonService implements OnModuleDestroy {
  readonly config = pistonConfig();
  private readonly clients = new Map<string, AxiosInstance>();
  private readonly registries = new Map<
    string,
    { at: number; value: PistonRuntime[]; pending?: Promise<PistonRuntime[]> }
  >();
  private readonly controllers = new Set<AbortController>();
  private readonly pool: ProviderPool;
  private readonly latencies: number[] = [];
  constructor(@Optional() private readonly redis?: RedisService) {
    this.pool = new ProviderPool(
      {
        name: 'piston',
        urls: this.config.urls,
        concurrency: this.config.concurrency,
        globalConcurrency: this.config.globalConcurrency,
        nodeConcurrency: this.config.nodeConcurrency,
        leaseMs: this.config.requestTimeout * 2 + 10000,
        failureThreshold: this.config.circuitFailureThreshold,
        cooldownMs: this.config.circuitCooldownMs,
      },
      redis,
    );
    for (const url of this.config.urls)
      this.clients.set(
        url,
        axios.create({
          baseURL: url,
          timeout: this.config.requestTimeout,
          proxy: false,
          maxRedirects: 0,
          maxContentLength: 2_000_000,
          maxBodyLength: 2_000_000,
          ...(this.config.keepAlive
            ? {
                httpAgent: new HttpAgent({
                  keepAlive: true,
                  maxSockets: this.config.concurrency,
                }),
                httpsAgent: new HttpsAgent({
                  keepAlive: true,
                  maxSockets: this.config.concurrency,
                }),
              }
            : {}),
          headers: this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {},
        }),
      );
  }
  invalidateRuntimes() {
    this.registries.clear();
  }
  metrics() {
    const metrics = this.pool.metrics();
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const percentile = (p: number) =>
      sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
        : undefined;
    return {
      ...metrics,
      circuitState: metrics.nodes[0]?.circuitState,
      latencyP50Ms: percentile(0.5),
      latencyP95Ms: percentile(0.95),
      errorRate: metrics.requests ? metrics.failures / metrics.requests : 0,
    };
  }
  private async registry(url: string, force = false): Promise<PistonRuntime[]> {
    const cached = this.registries.get(url);
    if (cached?.pending) return cached.pending;
    if (!force && cached && Date.now() - cached.at < this.config.cacheTtl)
      return cached.value;
    const state = {
      at: 0,
      value: [] as PistonRuntime[],
      pending: undefined as Promise<PistonRuntime[]> | undefined,
    };
    this.registries.set(url, state);
    state.pending = (async () => {
      const { data } = await this.clients.get(url)!.get<unknown>('/runtimes');
      if (
        !Array.isArray(data) ||
        data.some(
          (r: PistonRuntime) =>
            !r ||
            typeof r.language !== 'string' ||
            typeof r.version !== 'string' ||
            !Array.isArray(r.aliases) ||
            r.aliases.some((a: unknown) => typeof a !== 'string'),
        )
      )
        throw new PistonUnavailableError();
      state.value = data as PistonRuntime[];
      state.at = Date.now();
      return state.value;
    })();
    try {
      return await state.pending;
    } finally {
      state.pending = undefined;
    }
  }
  async runtimes(force = false): Promise<PistonRuntime[]> {
    return this.pool.inspect((url) => this.registry(url, force));
  }
  async availableLanguages() {
    const registry = await this.runtimes();
    return ['c', 'cpp', 'java', 'python', 'javascript', 'typescript'].map(
      (language) => {
        const runtime = registry.find(
          (r) =>
            canonicalLanguage(r.language) === language &&
            r.version === this.config.versions[language],
        );
        return { language, version: runtime?.version, enabled: !!runtime };
      },
    );
  }
  async execute(
    language: string,
    filename: string,
    code: string,
    stdin: string,
    limits: { timeLimit?: number; memoryLimit?: number } = {},
  ): Promise<PistonResponse> {
    const canonical = canonicalLanguage(language);
    if (!canonical)
      throw new BadRequestException('Unsupported execution language');
    if (
      Buffer.byteLength(code) > 1_000_000 ||
      Buffer.byteLength(stdin) > 262144 ||
      !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(filename)
    )
      throw new BadRequestException('Execution payload exceeds allowed limits');
    const start = Date.now();
    try {
      return await this.pool.execute(async (url) => {
        const registry = await this.registry(url);
        const runtime = registry.find(
          (r) =>
            canonicalLanguage(r.language) === canonical &&
            r.version === this.config.versions[canonical],
        );
        if (!runtime) throw new PistonUnavailableError();
        const bounded = (value: unknown, fallback: number, minimum: number) =>
          Number.isFinite(value)
            ? Math.max(minimum, Math.min(fallback, Number(value)))
            : fallback;
        const request: PistonRequest = {
          language: runtime.language,
          version: runtime.version,
          files: [{ name: filename, content: code }],
          stdin,
          run_timeout: Math.floor(
            bounded(
              limits.timeLimit === undefined
                ? undefined
                : limits.timeLimit * this.config.timeMultiplier,
              this.config.runTimeout,
              100,
            ),
          ),
          compile_timeout: this.config.compileTimeout,
          run_memory_limit: Math.floor(
            bounded(
              limits.memoryLimit === undefined
                ? undefined
                : limits.memoryLimit * 1048576,
              this.config.memory,
              33554432,
            ),
          ),
          compile_memory_limit: this.config.compileMemory,
        };
        const controller = new AbortController();
        this.controllers.add(controller);
        try {
          const { data } = await this.clients
            .get(url)!
            .post<PistonResponse>('/execute', request, {
              signal: controller.signal,
              headers: { 'X-Correlation-ID': randomUUID() },
            });
          if (
            !data ||
            data.language !== runtime.language ||
            data.version !== runtime.version ||
            (!data.compile && !data.run)
          )
            throw new PistonUnavailableError();
          for (const stage of [data.compile, data.run])
            if (stage) this.validateStage(stage);
          if (!data.run && (!data.compile || data.compile.code === 0))
            throw new PistonUnavailableError();
          if (data.run?.status === 'XX' || data.compile?.status === 'XX')
            throw new PistonUnavailableError();
          return data;
        } finally {
          this.controllers.delete(controller);
        }
      });
    } finally {
      if (this.latencies.length >= 256) this.latencies.shift();
      this.latencies.push(Date.now() - start);
    }
  }
  private validateStage(stage: PistonStage) {
    if (
      typeof stage.stdout !== 'string' ||
      typeof stage.stderr !== 'string' ||
      typeof stage.output !== 'string' ||
      !(stage.code === null || Number.isInteger(stage.code)) ||
      !(stage.signal === null || typeof stage.signal === 'string')
    )
      throw new PistonUnavailableError();
    for (const metric of [stage.cpu_time, stage.wall_time, stage.memory])
      if (metric != null && (!Number.isFinite(metric) || metric < 0))
        throw new PistonUnavailableError();
  }
  onModuleDestroy() {
    this.pool.close();
    for (const controller of this.controllers) controller.abort();
    for (const client of this.clients.values()) {
      (client.defaults.httpAgent as HttpAgent | undefined)?.destroy();
      (client.defaults.httpsAgent as HttpsAgent | undefined)?.destroy();
    }
  }
}
