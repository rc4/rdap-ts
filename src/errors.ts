import type { BaseIssue } from 'valibot';
import type { RdapErrorResponse } from './schemas';

/**
 * `true` when `error` is an abort, including `DOMException` named `AbortError`.
 * @param error Caught rejection or thrown value.
 * @returns Whether the value is an abort error.
 */
export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/** Machine-readable codes for non-HTTP client failures. */
export type RdapErrorCode =
  | 'invalid-input'
  | 'base-url-required'
  | 'bootstrap-failure'
  | 'bootstrap-not-found'
  | 'network-failure'
  | 'invalid-response';

/** Failure during input checks, discovery, the network, or validation. */
export class RdapError extends Error {
  /** Stable code for programmatic handling. */
  readonly code: RdapErrorCode;

  constructor(code: RdapErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RdapError';
    this.code = code;
  }
}

/** Non-successful RDAP HTTP response. */
export class RdapHttpError extends Error {
  /** Original Fetch response. */
  readonly response: Response;
  /** Parsed RDAP error body, when the server sent a valid one. */
  readonly body: RdapErrorResponse | undefined;
  /** Raw `Retry-After` header, if the server sent one. */
  readonly retryAfter: string | undefined;

  constructor(response: Response, body?: RdapErrorResponse) {
    super(`RDAP request failed with HTTP ${String(response.status)}`);
    this.name = 'RdapHttpError';
    this.response = response;
    this.body = body;
    this.retryAfter = response.headers.get('retry-after') ?? undefined;
  }
}

/** Successful HTTP response whose JSON was not valid RDAP. */
export class RdapValidationError extends RdapError {
  /** Valibot issues; empty when the body was not JSON. */
  readonly issues: readonly BaseIssue<unknown>[];
  /** Original Fetch response. */
  readonly response: Response;

  constructor(response: Response, issues: readonly BaseIssue<unknown>[], options?: ErrorOptions) {
    super('invalid-response', 'The server returned an invalid RDAP response', options);
    this.name = 'RdapValidationError';
    this.response = response;
    this.issues = issues;
  }
}
