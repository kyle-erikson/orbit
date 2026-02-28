/**
 * errors.ts
 *
 * Tagged error types used throughout the Effect pipeline.
 * Each error class carries a human-readable `message` and, where relevant,
 * the underlying `cause` so that it can be logged or surfaced to the caller.
 */

export class ParseError {
  readonly _tag = "ParseError" as const;
  constructor(
    public readonly message: string,
    public readonly cause?: unknown
  ) {}
}

export class AuthError {
  readonly _tag = "AuthError" as const;
  constructor(
    public readonly message: string,
    public readonly cause?: unknown
  ) {}
}

export class ApifyError {
  readonly _tag = "ApifyError" as const;
  constructor(
    public readonly message: string,
    public readonly cause?: unknown
  ) {}
}

export class GeminiError {
  readonly _tag = "GeminiError" as const;
  constructor(
    public readonly message: string,
    public readonly cause?: unknown
  ) {}
}

export class DatabaseError {
  readonly _tag = "DatabaseError" as const;
  constructor(
    public readonly message: string,
    public readonly cause?: unknown
  ) {}
}

export type PipelineError =
  | ParseError
  | AuthError
  | ApifyError
  | GeminiError
  | DatabaseError;
