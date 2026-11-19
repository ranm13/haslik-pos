import type { ErrorCode } from '../../../shared/api';

/** An error whose message is safe to show to the bartender (Hebrew). */
export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}

export const fail = (code: ErrorCode, message: string): never => {
  throw new AppError(code, message);
};

export const invalid = (message: string): never => fail('VALIDATION', message);
