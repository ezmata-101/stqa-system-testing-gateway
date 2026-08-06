import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../common/config/config.service';

export interface StqaContextPayload {
  offeringId: string;
  teamId: string;
  studentId: string;
  databaseName: string;
  requestId: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Signs and verifies the short-lived internal context token forwarded to
 * the buggy backend as `X-STQA-Context` (spec section 9). HS256 with a
 * shared secret keeps this simple to verify from any backend language/stack
 * without depending on the gateway's codebase.
 */
@Injectable()
export class ContextSigningService {
  constructor(private readonly config: ConfigService) {}

  sign(payload: Omit<StqaContextPayload, 'issuedAt' | 'expiresAt'>): string {
    const ttl = this.config.defaultContextTokenTtlSeconds;
    return jwt.sign({ ...payload }, this.config.contextSigningSecret, {
      algorithm: 'HS256',
      expiresIn: ttl,
      issuer: 'stqa-gateway',
    });
  }

  /** Verifies a token this gateway itself issued. Only used in tests/tooling. */
  verify(token: string): StqaContextPayload {
    const decoded = jwt.verify(token, this.config.contextSigningSecret, {
      algorithms: ['HS256'],
      issuer: 'stqa-gateway',
    }) as jwt.JwtPayload;
    return {
      offeringId: decoded.offeringId,
      teamId: decoded.teamId,
      studentId: decoded.studentId,
      databaseName: decoded.databaseName,
      requestId: decoded.requestId,
      issuedAt: decoded.iat!,
      expiresAt: decoded.exp!,
    };
  }
}
