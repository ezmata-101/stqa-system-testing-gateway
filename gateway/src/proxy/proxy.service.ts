import { Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ContextSigningService } from '../context/context-signing.service';
import { OfferingsService } from '../offerings/offerings.service';
import { RequestLoggerService } from '../logging/request-logger.service';
import { ConfigService } from '../common/config/config.service';
import { GatewayError, GatewayErrorCode } from '../common/errors/gateway-error';
import { stripOfferingPrefix } from '../auth/path.util';
import { hashWithSecret } from '../common/util/crypto.util';

// Headers that must never be forwarded verbatim: hop-by-hop headers, plus
// the raw lab key (already stripped by LabAuthMiddleware).
const NEVER_FORWARD_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'x-stqa-key',
  'transfer-encoding',
]);
const NEVER_FORWARD_RESPONSE_HEADERS = new Set([
  'connection',
  'content-length',
  'transfer-encoding',
  'content-encoding', // fetch() already decodes; re-compressing would corrupt the body
]);

/**
 * Implements the wildcard forwarding described in spec sections 6 and 8:
 * strips the offering prefix, attaches the signed internal context, forwards
 * the request to the semester's configured backend, and streams the
 * response back with the request ID preserved. Logs both the request and
 * the outcome (including timeouts/backend errors) via RequestLoggerService.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly contextSigning: ContextSigningService,
    private readonly offerings: OfferingsService,
    private readonly requestLogger: RequestLoggerService,
    private readonly config: ConfigService,
  ) {}

  async forward(req: Request, res: Response): Promise<void> {
    const context = req.stqaContext;
    if (!context) {
      throw new GatewayError(
        500,
        GatewayErrorCode.INTERNAL_ERROR,
        'Request context was not resolved before proxying.',
      );
    }

    const backendVersion = await this.offerings.getBackendVersion(
      context.offering.backendVersionId,
    );
    if (!backendVersion) {
      throw new GatewayError(
        500,
        GatewayErrorCode.BACKEND_UNAVAILABLE,
        'No backend is configured for this offering.',
      );
    }

    const forwardPath = stripOfferingPrefix(req.path, context.offering.code);
    const targetUrl = new URL(forwardPath, backendVersion.backendUrl);
    targetUrl.search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

    const signedContext = this.contextSigning.sign({
      offeringId: context.offering.id,
      teamId: context.teamId,
      studentId: context.studentId,
      databaseName: context.databaseName,
      requestId: context.requestId,
    });

    const outboundHeaders = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || NEVER_FORWARD_REQUEST_HEADERS.has(key.toLowerCase())) continue;
      outboundHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    outboundHeaders.set('x-stqa-context', signedContext);

    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const applicationTokenHash = req.headers.authorization
      ? hashWithSecret(String(req.headers.authorization), this.config.credentialHashSecret)
      : null;

    // Step 13: log the incoming request before forwarding.
    this.requestLogger.log({
      requestId: context.requestId,
      offeringId: context.offering.code,
      teamId: context.teamCode,
      studentId: context.studentId,
      startedAt: context.startedAt,
      completedAt: null,
      method: req.method,
      path: req.path,
      queryString: targetUrl.search || null,
      statusCode: null,
      responseTimeMs: null,
      requestHeaders: req.headers,
      requestBody: this.parseBodyForLogging(rawBody, req.headers['content-type']),
      responseHeaders: null,
      responseBody: null,
      applicationTokenHash,
      applicationAuthenticated: req.headers.authorization ? true : false,
      sourceIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const hasBody = !['GET', 'HEAD'].includes(req.method);

    try {
      const backendResponse = await fetch(targetUrl, {
        method: req.method,
        headers: outboundHeaders,
        body: hasBody ? new Uint8Array(rawBody) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.defaultRequestTimeoutMs),
      });

      const responseBodyBuffer = Buffer.from(await backendResponse.arrayBuffer());
      const responseTimeMs = Date.now() - context.startedAt.getTime();

      res.status(backendResponse.status);
      const responseHeadersForLog: Record<string, string> = {};
      backendResponse.headers.forEach((value, key) => {
        responseHeadersForLog[key] = value;
        if (!NEVER_FORWARD_RESPONSE_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      res.setHeader('X-STQA-Request-ID', context.requestId);

      const finalBody = this.injectRequestIdIfJson(
        responseBodyBuffer,
        backendResponse.headers.get('content-type'),
        context.requestId,
      );
      res.send(finalBody);

      this.requestLogger.log({
        requestId: context.requestId,
        offeringId: context.offering.code,
        teamId: context.teamCode,
        studentId: context.studentId,
        startedAt: context.startedAt,
        completedAt: new Date(),
        method: req.method,
        path: req.path,
        queryString: targetUrl.search || null,
        statusCode: backendResponse.status,
        responseTimeMs,
        requestHeaders: req.headers,
        requestBody: null,
        responseHeaders: responseHeadersForLog,
        responseBody: this.parseBodyForLogging(responseBodyBuffer, backendResponse.headers.get('content-type')),
        applicationTokenHash,
        applicationAuthenticated: req.headers.authorization ? true : false,
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      const errorType = isTimeout ? 'backend_timeout' : 'backend_unreachable';
      this.logger.warn(`Backend ${errorType} for request ${context.requestId}: ${err}`);

      this.requestLogger.log({
        requestId: context.requestId,
        offeringId: context.offering.code,
        teamId: context.teamCode,
        studentId: context.studentId,
        startedAt: context.startedAt,
        completedAt: new Date(),
        method: req.method,
        path: req.path,
        queryString: targetUrl.search || null,
        statusCode: isTimeout ? 504 : 502,
        responseTimeMs: Date.now() - context.startedAt.getTime(),
        requestHeaders: req.headers,
        requestBody: null,
        responseHeaders: null,
        responseBody: null,
        applicationTokenHash,
        applicationAuthenticated: req.headers.authorization ? true : false,
        errorType,
      });

      throw new GatewayError(
        isTimeout ? 504 : 502,
        isTimeout ? GatewayErrorCode.BACKEND_TIMEOUT : GatewayErrorCode.BACKEND_UNAVAILABLE,
        isTimeout ? 'The backend did not respond in time.' : 'The backend is unavailable.',
      );
    }
  }

  private parseBodyForLogging(buf: Buffer, contentType?: string | null): unknown {
    if (!buf || buf.length === 0) return null;
    if (contentType && contentType.includes('application/json')) {
      try {
        return JSON.parse(buf.toString('utf8'));
      } catch {
        return buf.toString('utf8');
      }
    }
    if (contentType && contentType.startsWith('text/')) return buf.toString('utf8');
    return `[${buf.length} bytes binary]`;
  }

  /**
   * Adds `_lab.requestId` to JSON object responses (spec section 17), only
   * when the body is a JSON object (not an array/primitive) so we never
   * change the response's structural type.
   */
  private injectRequestIdIfJson(
    buf: Buffer,
    contentType: string | null,
    requestId: string,
  ): Buffer {
    if (!contentType || !contentType.includes('application/json') || buf.length === 0) {
      return buf;
    }
    try {
      const parsed = JSON.parse(buf.toString('utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return buf;
      }
      parsed._lab = { ...(parsed._lab ?? {}), requestId };
      return Buffer.from(JSON.stringify(parsed), 'utf8');
    } catch {
      return buf;
    }
  }
}
