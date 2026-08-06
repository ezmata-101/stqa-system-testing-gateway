import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { OfferingsService } from '../offerings/offerings.service';
import { CredentialsService } from '../credentials/credentials.service';
import { TeamsService } from '../teams/teams.service';
import { GatewayError, GatewayErrorCode } from '../common/errors/gateway-error';
import { UNTRUSTED_INTERNAL_HEADERS, extractOfferingCodeFromPath } from './path.util';
import './request-context';

/**
 * Implements the request processing flow from spec section 8 (steps 1-9):
 * resolves offering + student + team + database from the `X-STQA-Key`
 * header, strips any untrusted internal headers, generates the request ID,
 * and attaches a trusted `stqaContext` to the request for downstream
 * modules (proxy, logging, rate-limit, reset).
 */
@Injectable()
export class LabAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly offerings: OfferingsService,
    private readonly credentials: CredentialsService,
    private readonly teams: TeamsService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = uuidv4();
    req.stqaRequestId = requestId;
    res.setHeader('X-STQA-Request-ID', requestId);

    // Step 11: remove all untrusted internal STQA headers unconditionally,
    // before any trust decisions are made.
    for (const header of UNTRUSTED_INTERNAL_HEADERS) {
      delete req.headers[header];
    }

    try {
      const offeringCodeFromPath = extractOfferingCodeFromPath(req.path);
      let offering = offeringCodeFromPath
        ? await this.offerings.findByCode(offeringCodeFromPath)
        : null;

      if (offeringCodeFromPath && !offering) {
        throw new GatewayError(
          404,
          GatewayErrorCode.UNKNOWN_OFFERING,
          `No assignment offering found for code "${offeringCodeFromPath}".`,
        );
      }
      if (offering && !this.offerings.isActive(offering)) {
        throw new GatewayError(
          403,
          GatewayErrorCode.OFFERING_NOT_ACTIVE,
          'This assignment offering is not currently active.',
        );
      }

      const rawKey = req.headers['x-stqa-key'];
      if (!rawKey || Array.isArray(rawKey)) {
        throw new GatewayError(
          401,
          GatewayErrorCode.MISSING_LAB_CREDENTIAL,
          'The X-STQA-Key header is required.',
        );
      }

      const verification = await this.credentials.verify(rawKey);
      if (verification.status !== 'ok') {
        if (verification.status === 'expired') {
          throw new GatewayError(
            401,
            GatewayErrorCode.EXPIRED_LAB_CREDENTIAL,
            'This lab credential has expired.',
          );
        }
        if (verification.status === 'revoked') {
          throw new GatewayError(
            401,
            GatewayErrorCode.REVOKED_LAB_CREDENTIAL,
            'This lab credential has been revoked.',
          );
        }
        throw new GatewayError(
          401,
          GatewayErrorCode.INVALID_LAB_CREDENTIAL,
          'The X-STQA-Key header is invalid.',
        );
      }
      const credential = verification.record;

      if (offering && credential.offeringId !== offering.id) {
        throw new GatewayError(
          403,
          GatewayErrorCode.STUDENT_NOT_IN_OFFERING,
          'This lab credential does not belong to the requested offering.',
        );
      }
      if (!offering) {
        offering = await this.offerings.findById(credential.offeringId);
        if (!offering) {
          throw new GatewayError(
            404,
            GatewayErrorCode.UNKNOWN_OFFERING,
            'The offering for this credential no longer exists.',
          );
        }
        if (!this.offerings.isActive(offering)) {
          throw new GatewayError(
            403,
            GatewayErrorCode.OFFERING_NOT_ACTIVE,
            'This assignment offering is not currently active.',
          );
        }
      }

      const team = await this.teams.findByStudentAndOffering(credential.studentId, offering.id);
      if (!team) {
        throw new GatewayError(
          404,
          GatewayErrorCode.TEAM_NOT_FOUND,
          'No team was found for this student in this offering.',
        );
      }

      req.stqaContext = {
        requestId,
        offering,
        studentId: credential.studentId,
        teamId: team.id,
        teamCode: team.teamCode,
        databaseName: team.databaseName,
        startedAt: new Date(),
      };

      // Never forward the raw lab key to the backend.
      delete req.headers['x-stqa-key'];

      next();
    } catch (err) {
      next(err);
    }
  }
}
