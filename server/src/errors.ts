import type { ErrorCode } from '@shared/types.js';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function errorPayload(error: unknown): { code: ErrorCode; message: string; retryable: boolean } {
  if (isAppError(error)) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: 'INTERNAL',
    message: 'Something went wrong on the signaling server. Please try again.',
    retryable: true,
  };
}
