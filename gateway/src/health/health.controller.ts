import { Controller, Get } from '@nestjs/common';

/**
 * Gateway's own liveness endpoint. Distinct from the semester backend's
 * `/_internal/health`, which is only reachable from the gateway/dashboard,
 * never directly by students.
 */
@Controller('health')
export class HealthController {
  @Get()
  liveness() {
    return { status: 'healthy', service: 'stqa-gateway' };
  }
}
