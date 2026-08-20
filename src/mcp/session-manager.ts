import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

type Transport = StreamableHTTPServerTransport | SSEServerTransport;

interface ManagedSession {
  transport: Transport;
  createdAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS, cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS) {
    this.ttlMs = ttlMs;
    if (cleanupIntervalMs > 0) {
      this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
      if (this.timer.unref) this.timer.unref();
    }
  }

  add(id: string, transport: Transport): void {
    this.sessions.set(id, { transport, createdAt: Date.now() });
  }

  get(id: string): Transport | undefined {
    return this.sessions.get(id)?.transport;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  /** Remove sessions older than TTL. Returns count of cleaned sessions. */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id] of this.sessions) {
      const session = this.sessions.get(id)!;
      if (now - session.createdAt > this.ttlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /** Stop cleanup timer and clear all sessions. */
  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.sessions.clear();
  }

  get size(): number {
    return this.sessions.size;
  }
}
