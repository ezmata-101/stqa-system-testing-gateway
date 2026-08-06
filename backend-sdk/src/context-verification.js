const jwt = require('jsonwebtoken');

/**
 * Verifies the short-lived `X-STQA-Context` token issued by the STQA
 * gateway (spec section 9). Any backend — regardless of language or
 * framework — can implement the equivalent of this ~15-line function using
 * any standard JWT library; this is provided only as a convenience
 * reference for Node.js backends.
 *
 * @param {string} token - raw value of the `X-STQA-Context` header
 * @param {string} secret - value of CONTEXT_SIGNING_SECRET, shared only
 *   between the gateway and this backend (never with students)
 * @returns {{offeringId: string, teamId: string, studentId: string, databaseName: string, requestId: string, issuedAt: number, expiresAt: number}}
 * @throws if the token is missing, expired, or has an invalid signature
 */
function verifyStqaContext(token, secret) {
  if (!token) {
    throw new Error('Missing X-STQA-Context header. Requests must come through the gateway.');
  }
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'stqa-gateway',
  });
  const required = ['offeringId', 'teamId', 'studentId', 'databaseName', 'requestId'];
  for (const field of required) {
    if (!decoded[field]) {
      throw new Error(`X-STQA-Context is missing required field: ${field}`);
    }
  }
  return {
    offeringId: decoded.offeringId,
    teamId: decoded.teamId,
    studentId: decoded.studentId,
    databaseName: decoded.databaseName,
    requestId: decoded.requestId,
    issuedAt: decoded.iat,
    expiresAt: decoded.exp,
  };
}

module.exports = { verifyStqaContext };
