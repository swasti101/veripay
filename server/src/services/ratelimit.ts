// In-memory per-IP token bucket. For multi-instance deployments replace with Redis.
import type { Request, Response, NextFunction } from 'express';

interface Bucket { tokens: number; refilled: number }
const buckets = new Map<string, Bucket>();
const key = (req: Request, scope: string) => `${scope}:${req.ip || req.socket.remoteAddress || 'anon'}`;

export function rateLimit(scope: string, { perMinute, burst }: { perMinute: number; burst: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const k = key(req, scope);
    const now = Date.now();
    const b = buckets.get(k) || { tokens: burst, refilled: now };
    const elapsed = (now - b.refilled) / 60000;
    b.tokens = Math.min(burst, b.tokens + elapsed * perMinute);
    b.refilled = now;
    if (b.tokens < 1) {
      res.setHeader('Retry-After', '30');
      return res.status(429).json({ error: 'Too many attempts — try again in a minute.' });
    }
    b.tokens -= 1;
    buckets.set(k, b);
    next();
  };
}

// Periodically evict buckets that have fully refilled.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.refilled > 300000) buckets.delete(k);
}, 60000).unref();
