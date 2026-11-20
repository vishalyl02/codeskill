import api from '@/config/api';
import {
  isLockdownClient,
  vaultUpsertAutosave,
  vaultReadAllAutosaves,
  vaultRemoveEntry,
  vaultPurgeAttempt,
} from './lockdown-bridge';

export type SyncStatus = 'synced' | 'syncing' | 'offline-buffered' | 'error';

export interface AutosavePayload {
  attemptId: string;
  questionId: string;
  payload: any;
  endpoint?: string;
  method?: string;
  updatedAt?: number;
  candidateId?: string;
}

export type StatusListener = (status: SyncStatus, pendingCount: number) => void;

interface StoredRecord {
  attemptId: string;
  questionId: string;
  payload: any;
  endpoint: string;
  method: string;
  updatedAt: number;
  candidateId?: string;
}

// In-memory fallback storage for environments without IndexedDB (e.g. Node / SSR / Jest)
const memoryStorage = new Map<string, string>();

let webCryptoKey: CryptoKey | null = null;

async function getBrowserCryptoKey(): Promise<CryptoKey | null> {
  if (webCryptoKey) return webCryptoKey;
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    webCryptoKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    return webCryptoKey;
  } catch {
    return null;
  }
}

async function encryptBrowserPayload(plaintext: string): Promise<{ iv: string; ct: string } | null> {
  const key = await getBrowserCryptoKey();
  if (!key || typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ctBuffer = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return {
      iv: Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join(''),
      ct: Array.from(new Uint8Array(ctBuffer)).map((b) => b.toString(16).padStart(2, '0')).join(''),
    };
  } catch {
    return null;
  }
}

async function decryptBrowserPayload(ivHex: string, ctHex: string): Promise<string | null> {
  const key = await getBrowserCryptoKey();
  if (!key || typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    const ct = new Uint8Array(ctHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open('codeskill_exam_vault', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('autosaves')) {
          db.createObjectStore('autosaves');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class OfflineAutosaveQueue {
  private queue = new Map<string, StoredRecord>();
  private status: SyncStatus = 'synced';
  private listeners: Set<StatusListener> = new Set();
  private retryTimer: any = null;
  private currentBackoffMs = 2000;
  private readonly minBackoffMs = 2000;
  private readonly maxBackoffMs = 15000;
  private flushPromise: Promise<boolean> | null = null;
  private apiClient: any;
  private onlineListenerAttached = false;
  private sequenceNumber = 0;

  constructor(customApiClient?: any) {
    this.apiClient = customApiClient || api;
    this.attachOnlineListener();
  }

  public setApiClient(client: any): void {
    this.apiClient = client;
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public getPendingCount(): number {
    return this.queue.size;
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status, this.queue.size);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const count = this.queue.size;
    for (const listener of this.listeners) {
      try {
        listener(this.status, count);
      } catch (err) {
        console.warn('Error in autosave status listener:', err);
      }
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.notify();
  }

  private attachOnlineListener(): void {
    if (typeof window !== 'undefined' && !this.onlineListenerAttached) {
      window.addEventListener('online', () => {
        this.currentBackoffMs = this.minBackoffMs;
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        void this.flush();
      });
      this.onlineListenerAttached = true;
    }
  }

  private getEntryKey(attemptId: string, questionId: string): string {
    return `${attemptId}:${questionId}`;
  }

  /**
   * Persists an entry to storage:
   * - Uses Rust AES-256-GCM vault if inside LockDown client.
   * - Falls back to IndexedDB with WebCrypto in browsers.
   */
  private async persistToStorage(entryKey: string, record: StoredRecord): Promise<void> {
    const json = JSON.stringify(record);

    if (isLockdownClient()) {
      try {
        await vaultUpsertAutosave(record.attemptId, entryKey, json);
        return;
      } catch (err) {
        console.warn('Failed to save to LockDown vault:', err);
      }
    }

    // Browser WebCrypto + IndexedDB fallback
    try {
      const encrypted = await encryptBrowserPayload(json);
      const valToStore = encrypted ? JSON.stringify(encrypted) : json;
      const db = await openIndexedDb();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('autosaves', 'readwrite');
          tx.objectStore('autosaves').put(valToStore, entryKey);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      }
    } catch {
      // Fallback to memory
    }

    memoryStorage.set(entryKey, json);
  }

  /**
   * Removes an entry from persistent storage after successful network sync.
   */
  private async removeFromStorage(attemptId: string, entryKey: string): Promise<void> {
    if (isLockdownClient()) {
      try {
        await vaultRemoveEntry(attemptId, entryKey);
      } catch (err) {
        console.warn('Failed to remove entry from LockDown vault:', err);
      }
    }

    try {
      const db = await openIndexedDb();
      if (db) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction('autosaves', 'readwrite');
          tx.objectStore('autosaves').delete(entryKey);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      }
    } catch {
      // Ignore
    }

    memoryStorage.delete(entryKey);
  }

  /**
   * Hydrates the queue on exam load to recover any unsynced entries after a crash/restart.
   */
  public async hydrate(attemptId: string): Promise<void> {
    let recoveredCount = 0;

    if (isLockdownClient()) {
      try {
        const entries = await vaultReadAllAutosaves(attemptId);
        for (const [key, plaintext] of Object.entries(entries)) {
          try {
            const parsed = JSON.parse(plaintext) as StoredRecord;
            this.queue.set(key, parsed);
            recoveredCount++;
          } catch {
            // Ignore malformed entry
          }
        }
      } catch (err) {
        console.warn('Could not hydrate from LockDown vault:', err);
      }
    }

    // Also check browser IndexedDB
    try {
      const db = await openIndexedDb();
      if (db) {
        const records = await new Promise<Record<string, string>>((resolve) => {
          const tx = db.transaction('autosaves', 'readonly');
          const store = tx.objectStore('autosaves');
          const map: Record<string, string> = {};
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = async () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const key = String(cursor.key);
              if (key.startsWith(`${attemptId}:`)) {
                map[key] = String(cursor.value);
              }
              cursor.continue();
            } else {
              resolve(map);
            }
          };
          cursorReq.onerror = () => resolve({});
        });

        for (const [key, storedVal] of Object.entries(records)) {
          if (!this.queue.has(key)) {
            try {
              let plaintext: string | null = null;
              if (storedVal.startsWith('{') && storedVal.includes('"iv"') && storedVal.includes('"ct"')) {
                const parsed = JSON.parse(storedVal);
                plaintext = await decryptBrowserPayload(parsed.iv, parsed.ct);
              } else {
                plaintext = storedVal;
              }
              if (plaintext) {
                const record = JSON.parse(plaintext) as StoredRecord;
                this.queue.set(key, record);
                recoveredCount++;
              }
            } catch {
              // Ignore invalid entry
            }
          }
        }
      }
    } catch {
      // Fallback check memory
      for (const [key, val] of memoryStorage.entries()) {
        if (key.startsWith(`${attemptId}:`) && !this.queue.has(key)) {
          try {
            this.queue.set(key, JSON.parse(val));
            recoveredCount++;
          } catch {
            // Ignore
          }
        }
      }
    }

    if (recoveredCount > 0) {
      this.setStatus('offline-buffered');
      void this.flush();
    } else {
      this.setStatus('synced');
    }
  }

  /**
   * Enqueues an autosave request with Last-Write-Wins coalescing per (attemptId:questionId).
   */
  public async enqueue(item: AutosavePayload): Promise<void> {
    const entryKey = this.getEntryKey(item.attemptId, item.questionId);
    const endpoint = item.endpoint || `/assessments/${item.attemptId}/progress`;
    const method = (item.method || 'POST').toUpperCase();

    const record: StoredRecord = {
      attemptId: item.attemptId,
      questionId: item.questionId,
      payload: item.payload,
      endpoint,
      method,
      updatedAt: item.updatedAt || Date.now(),
      candidateId: item.candidateId,
    };

    // Coalesce in memory (Last-Write-Wins)
    this.queue.set(entryKey, record);

    // Save to encrypted persistent storage
    await this.persistToStorage(entryKey, record);

    if (this.status !== 'offline-buffered') {
      this.setStatus('syncing');
      await this.flush();
    } else {
      this.notify();
    }
  }

  /**
   * Immediately triggers a flush with an optional API client override.
   */
  public async forceSyncNow(apiClient?: any): Promise<boolean> {
    if (apiClient) {
      this.setApiClient(apiClient);
    }
    return this.flush();
  }

  /**
   * Flushes all pending entries in the queue by replaying through apiClient.
   * Signatures are generated at transmission time by Axios interceptors.
   */
  public async flush(): Promise<boolean> {
    if (this.flushPromise) {
      return this.flushPromise;
    }
    if (this.queue.size === 0) {
      this.setStatus('synced');
      return true;
    }

    this.flushPromise = this.performFlush().finally(() => {
      this.flushPromise = null;
    });

    return this.flushPromise;
  }

  private async performFlush(): Promise<boolean> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    let allSuccess = true;
    const keys = Array.from(this.queue.keys());

    for (const key of keys) {
      const entry = this.queue.get(key);
      if (!entry) continue;

      const candidateId = entry.candidateId || 'candidate';
      const autosaveKey = `autosave:${entry.attemptId}:${candidateId}:${++this.sequenceNumber}`;
      const headers = { 'X-Idempotency-Key': autosaveKey };
      const dataWithFallback =
        entry.payload && typeof entry.payload === 'object'
          ? { ...entry.payload, idempotencyKey: autosaveKey }
          : entry.payload;

      try {
        if (this.apiClient && typeof this.apiClient.request === 'function') {
          await this.apiClient.request({
            url: entry.endpoint,
            method: entry.method,
            data: dataWithFallback,
            headers,
          });
        } else if (this.apiClient && typeof this.apiClient.post === 'function' && entry.method === 'POST') {
          await this.apiClient.post(entry.endpoint, dataWithFallback, { headers });
        } else if (typeof window !== 'undefined' && typeof fetch === 'function') {
          // Standard fetch fallback - normalize relative URL if needed
          const origin = window.location?.origin || '';
          const targetUrl = entry.endpoint.startsWith('http') || !origin
            ? entry.endpoint
            : `${origin}${entry.endpoint}`;
          const res = await fetch(targetUrl, {
            method: entry.method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(dataWithFallback),
          });
          if (!res.ok) {
            const error: any = new Error(`HTTP error ${res.status}`);
            error.response = {
              status: res.status,
              headers: { 'retry-after': res.headers.get('retry-after') },
            };
            throw error;
          }
        }

        // Successfully synced!
        this.queue.delete(key);
        await this.removeFromStorage(entry.attemptId, key);
      } catch (err: any) {
        allSuccess = false;
        const status = err?.response?.status;
        const isNetworkOr5xx = !status || status >= 500 || status === 429;
        const retryHeader = err?.response?.headers?.['retry-after'] || err?.response?.data?.retryAfter;
        const retryAfterSeconds = retryHeader ? parseInt(String(retryHeader), 10) : undefined;

        if (isNetworkOr5xx) {
          this.setStatus('offline-buffered');
          this.scheduleRetry(retryAfterSeconds);
        } else {
          // 4xx client errors
          this.setStatus('error');
        }
        break; // Stop replaying current batch on connection failure
      }
    }

    if (this.queue.size === 0) {
      this.currentBackoffMs = this.minBackoffMs;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.setStatus('synced');
      return true;
    }

    return allSuccess;
  }

  private scheduleRetry(retryAfterSeconds?: number): void {
    if (this.retryTimer) return;

    let baseDelay = this.currentBackoffMs;
    if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
      baseDelay = retryAfterSeconds * 1000;
    }
    // Jittered exponential backoff: add 50-500ms random jitter
    const jitter = Math.floor(Math.random() * 450) + 50;
    const finalDelay = baseDelay + jitter;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
      void this.flush();
    }, finalDelay);
  }

  /**
   * Purges all in-memory entries and permanently zeroes out the encrypted vault file upon exam submission.
   */
  public async purgeAll(attemptId: string): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Remove matching keys from in-memory queue
    for (const key of Array.from(this.queue.keys())) {
      if (key.startsWith(`${attemptId}:`)) {
        this.queue.delete(key);
      }
    }

    // Zero-fill and purge Rust Tauri vault file
    if (isLockdownClient()) {
      try {
        await vaultPurgeAttempt(attemptId);
      } catch (err) {
        console.warn('Could not purge LockDown vault:', err);
      }
    }

    // Purge from browser storage
    try {
      const db = await openIndexedDb();
      if (db) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction('autosaves', 'readwrite');
          const store = tx.objectStore('autosaves');
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const k = String(cursor.key);
              if (k.startsWith(`${attemptId}:`)) {
                cursor.delete();
              }
              cursor.continue();
            } else {
              resolve();
            }
          };
          cursorReq.onerror = () => resolve();
        });
      }
    } catch {
      // Ignore
    }

    for (const k of Array.from(memoryStorage.keys())) {
      if (k.startsWith(`${attemptId}:`)) {
        memoryStorage.delete(k);
      }
    }

    this.setStatus('synced');
  }
}

// Global singleton instance for easy import across assessment components
export const offlineAutosaveQueue = new OfflineAutosaveQueue();
