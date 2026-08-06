/**
 * Recommended gateway error codes (spec section 28).
 */
export enum GatewayErrorCode {
  MISSING_LAB_CREDENTIAL = 'MISSING_LAB_CREDENTIAL',
  INVALID_LAB_CREDENTIAL = 'INVALID_LAB_CREDENTIAL',
  EXPIRED_LAB_CREDENTIAL = 'EXPIRED_LAB_CREDENTIAL',
  REVOKED_LAB_CREDENTIAL = 'REVOKED_LAB_CREDENTIAL',
  UNKNOWN_OFFERING = 'UNKNOWN_OFFERING',
  OFFERING_NOT_ACTIVE = 'OFFERING_NOT_ACTIVE',
  STUDENT_NOT_IN_OFFERING = 'STUDENT_NOT_IN_OFFERING',
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  BACKEND_UNAVAILABLE = 'BACKEND_UNAVAILABLE',
  BACKEND_TIMEOUT = 'BACKEND_TIMEOUT',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  RESET_IN_PROGRESS = 'RESET_IN_PROGRESS',
  RESET_LIMIT_EXCEEDED = 'RESET_LIMIT_EXCEEDED',
  RESET_FAILED = 'RESET_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * A gateway-generated error that the exception filter renders using the
 * standard { error: { code, message }, _lab: { requestId } } envelope.
 */
export class GatewayError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: GatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
