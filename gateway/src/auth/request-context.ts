import { AssignmentOffering } from '../offerings/offerings.service';

/**
 * Trusted context resolved by LabAuthMiddleware and consumed by the proxy,
 * logging, rate-limit, and reset modules. Never derived from
 * student-supplied headers (spec section 7/9).
 */
export interface StqaRequestContext {
  requestId: string;
  offering: AssignmentOffering;
  studentId: string;
  teamId: string;
  teamCode: string;
  databaseName: string;
  startedAt: Date;
}

declare module 'express' {
  interface Request {
    stqaRequestId?: string;
    stqaContext?: StqaRequestContext;
    rawBody?: Buffer;
  }
}
