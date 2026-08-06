import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../common/config/config.service';

export interface RateLimitCheck {
  allowed: boolean;
  limit: number;
  remaining: number;
  scope: 'student' | 'team' | 'ip';
  limitKey: string;
}

/**
 * Fixed-window rate limiting backed by Redis (spec section 22). Limits are
 * configurable per offering (student/team requests-per-minute), with IP as
 * a secondary, non-authoritative signal. Uses Redis INCR + EXPIRE so the
 * hot path is a single round trip.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly windowSeconds = 60;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(config.redisUrl, { lazyConnect: false });
  }

  async checkAndIncrement(
    scope: 'student' | 'team' | 'ip',
    identity: string,
    limit: number,
  ): Promise<RateLimitCheck> {
    const window = Math.floor(Date.now() / 1000 / this.windowSeconds);
    const key = `stqa:ratelimit:${scope}:${identity}:${window}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.windowSeconds * 2);
    }
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      scope,
      limitKey: key,
    };
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
