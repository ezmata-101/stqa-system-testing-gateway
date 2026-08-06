import { Injectable } from '@nestjs/common';
import { BackendVersion } from '../offerings/offerings.service';

export interface BackendHealth {
  reachable: boolean;
  status?: string;
  version?: string;
  error?: string;
}

/**
 * Gateway liveness plus a proxy for checking a semester backend's
 * `/_internal/health` endpoint (spec section 10), used by the instructor
 * dashboard's offering overview.
 */
@Injectable()
export class HealthService {
  async checkBackend(backend: BackendVersion, timeoutMs = 5000): Promise<BackendHealth> {
    try {
      const url = new URL(backend.healthcheckPath, backend.backendUrl);
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        return { reachable: false, error: `HTTP ${response.status}` };
      }
      const body = (await response.json().catch(() => ({}))) as Record<string, any>;
      return { reachable: true, status: body.status, version: body.version };
    } catch (err) {
      return { reachable: false, error: err instanceof Error ? err.message : 'unknown error' };
    }
  }
}
