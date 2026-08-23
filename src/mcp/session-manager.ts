import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

type Transport = StreamableHTTPServerTransport | SSEServerTransport;

interface ManagedSession {
  transport: Transport;
  createdAt: number;
  /** Sliding idle clock — refreshed on get(). */
  lastUsedAt: number;
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
    const now = Date.now();
    this.sessions.set(id, { transport, createdAt: now, lastUsedAt: now });
  }

  get(id: string): Transport | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    // Sliding TTL: active ChatBox/Cursor sessions must not expire while in use
    session.lastUsedAt = Date.now();
    return session.transport;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  /** Remove idle sessions older than TTL (based on last use). Returns count cleaned. */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      const anchor = session.lastUsedAt ?? session.createdAt;
      if (now - anchor > this.ttlMs) {
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
