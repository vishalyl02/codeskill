import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { RedisService } from '../../redis/redis.service';
import { canonicalLanguage } from '../execution.types';
import { PistonUnavailableError } from '../piston/piston.types';
import { ProviderPool } from '../providers/provider-pool';
import { judge0Config } from './judge0.config';

export interface Judge0Result {
  status: { id: number };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | number | null;
  memory: number | null;
}
interface Judge0Language {
  id: number;
  name: string;
}

@Injectable()
export class Judge0Service implements OnModuleDestroy {
  readonly config = judge0Config();
  private readonly pool: ProviderPool;
  private readonly clients = new Map<string, AxiosInstance>();
  private readonly languages = new Map<
    string,
    { at: number; value: Judge0Language[]; pending?: Promise<Judge0Language[]> }
  >();
  private readonly controllers = new Set<AbortController>();
  constructor(private readonly redis: RedisService) {
    this.pool = new ProviderPool(
      {
        name: 'judge0',
        urls: this.config.urls,
        concurrency: this.config.concurrency,
        globalConcurrency: this.config.globalConcurrency,
        nodeConcurrency: this.config.nodeConcurrency,
        leaseMs:
          this.config.submissionTimeout + this.config.requestTimeout + 5000,
        failureThreshold: this.config.failureThreshold,
        cooldownMs: this.config.cooldownMs,
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
          httpAgent: new HttpAgent({
            keepAlive: true,
            maxSockets: this.config.concurrency,
          }),
          httpsAgent: new HttpsAgent({
            keepAlive: true,
            maxSockets: this.config.concurrency,
          }),
          headers: {
            ...(this.config.authToken
              ? { 'X-Auth-Token': this.config.authToken }
              : {}),
            ...(this.config.apiKey
              ? { 'X-RapidAPI-Key': this.config.apiKey }
              : {}),
            ...(this.config.apiHost
              ? { 'X-RapidAPI-Host': this.config.apiHost }
              : {}),
          },
        }),
      );
  }
  metrics() {
    return this.pool.metrics();
  }
  private async registry(url: string): Promise<Judge0Language[]> {
    const cached = this.languages.get(url);
    if (cached?.pending) return cached.pending;
    if (cached && Date.now() - cached.at < this.config.cacheTtl)
      return cached.value;
    const state = {
      at: 0,
      value: [] as Judge0Language[],
      pending: undefined as Promise<Judge0Language[]> | undefined,
    };
    this.languages.set(url, state);
    state.pending = (async () => {
      const { data } = await this.clients.get(url)!.get<unknown>('/languages');
      if (
        !Array.isArray(data) ||
        data.some(
          (entry: unknown) =>
            !entry ||
            typeof entry !== 'object' ||
            !Number.isInteger((entry as Judge0Language).id) ||
            typeof (entry as Judge0Language).name !== 'string',
        )
      )
        throw new PistonUnavailableError();
      state.value = data as Judge0Language[];
      state.at = Date.now();
      return state.value;
    })();
    try {
      return await state.pending;
    } finally {
      state.pending = undefined;
    }
  }
  async availableLanguages() {
    return this.pool.inspect(async (url) => {
      const installed = await this.registry(url);
      return ['c', 'cpp', 'java', 'python', 'javascript', 'typescript'].map(
        (language) => ({
          language,
          enabled: installed.some(
            (entry) => entry.id === this.config.languages[language],
          ),
          version: installed.find(
            (entry) => entry.id === this.config.languages[language],
          )?.name,
        }),
      );
    });
  }
  async execute(
    language: string,
    code: string,
    stdin: string,
    limits: { timeLimit?: number; memoryLimit?: number } = {},
  ): Promise<Judge0Result> {
    const canonical = canonicalLanguage(language);
    if (
      !canonical ||
      Buffer.byteLength(code) > 1_000_000 ||
      Buffer.byteLength(stdin) > 262144
    )
      throw new BadRequestException('Invalid Judge0 execution payload');
    const deadline = Date.now() + this.config.submissionTimeout;
    return this.pool.execute(async (url) => {
      const installed = await this.registry(url);
      const languageId = this.config.languages[canonical];
      if (!installed.some((entry) => entry.id === languageId))
        throw new PistonUnavailableError();
      const client = this.clients.get(url)!;
      const controller = new AbortController();
      this.controllers.add(controller);
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(1, deadline - Date.now()),
      );
      try {
        const timeMs = Math.max(
          100,
          Math.min(
            this.config.runTimeout,
            (Number(limits.timeLimit) || 2000) * this.config.timeMultiplier,
          ),
        );
        const memoryMb = Math.max(
          32,
          Math.min(this.config.memoryMb, Number(limits.memoryLimit) || 256),
        );
        const { data: created } = await client.post<{ token?: string }>(
          '/submissions',
          {
            language_id: languageId,
            source_code: Buffer.from(code).toString('base64'),
            stdin: Buffer.from(stdin).toString('base64'),
            cpu_time_limit: timeMs / 1000,
            wall_time_limit: Math.min(60, timeMs / 1000 + 5),
            memory_limit: memoryMb * 1024,
            max_file_size: Math.ceil(this.config.outputLimit / 1024),
            max_processes_and_or_threads: 64,
            number_of_runs: 1,
            enable_network: false,
            redirect_stderr_to_stdout: false,
          },
          {
            params: { base64_encoded: true, wait: false },
            signal: controller.signal,
          },
        );
        if (
          typeof created?.token !== 'string' ||
          !/^[a-zA-Z0-9-]{16,128}$/.test(created.token)
        )
          throw new PistonUnavailableError();
        while (Date.now() < deadline) {
          const { data } = await client.get<Judge0Result>(
            `/submissions/${created.token}`,
            {
              params: {
                base64_encoded: true,
                fields: 'stdout,stderr,compile_output,status,time,memory',
              },
              signal: controller.signal,
            },
          );
          if (
            !data?.status ||
            !Number.isInteger(data.status.id) ||
            data.status.id < 1 ||
            data.status.id > 14
          )
            throw new PistonUnavailableError();
          if (data.status.id <= 2) {
            await delay(this.config.pollInterval, undefined, {
              signal: controller.signal,
            });
            continue;
          }
          if ([13, 14].includes(data.status.id))
            throw new PistonUnavailableError();
          const normalized = { ...data };
          for (const field of ['stdout', 'stderr', 'compile_output'] as const) {
            const value = data[field];
            const compact =
              typeof value === 'string' ? value.replace(/[\r\n\t ]/g, '') : '';
            if (
              value != null &&
              (typeof value !== 'string' ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                  compact,
                ))
            )
              throw new PistonUnavailableError();
            normalized[field] =
              value == null
                ? null
                : Buffer.from(compact, 'base64').toString('utf8');
          }
          if (
            data.time != null &&
            (!Number.isFinite(Number(data.time)) || Number(data.time) < 0)
          )
            throw new PistonUnavailableError();
          if (
            data.memory != null &&
            (!Number.isFinite(data.memory) || data.memory < 0)
          )
            throw new PistonUnavailableError();
          return normalized;
        }
        throw new PistonUnavailableError();
      } finally {
        clearTimeout(timer);
        this.controllers.delete(controller);
      }
    });
  }
  onModuleDestroy() {
    this.pool.close();
    for (const controller of this.controllers) controller.abort();
    for (const client of this.clients.values()) {
      (client.defaults.httpAgent as HttpAgent).destroy();
      (client.defaults.httpsAgent as HttpsAgent).destroy();
    }
  }
}
