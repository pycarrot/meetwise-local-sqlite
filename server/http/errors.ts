import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function notFound(_request: Request, _response: Response, next: NextFunction): void {
  next(new ApiError(404, 'NOT_FOUND', 'Resource not found'));
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void {
  let normalized: ApiError;
  if (error instanceof ApiError) normalized = error;
  else if (error instanceof ZodError) {
    normalized = new ApiError(
      422,
      'VALIDATION_ERROR',
      'Request validation failed',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    );
  } else {
    normalized = new ApiError(500, 'INTERNAL_ERROR', 'An internal error occurred');
    request.log?.error({ err: error, code: normalized.code }, 'request failed');
  }
  const body: { error: { code: string; message: string; requestId: string; details?: unknown } } = {
    error: { code: normalized.code, message: normalized.message, requestId: request.requestId }
  };
  if (normalized.details !== undefined) body.error.details = normalized.details;
  response.status(normalized.status).json(body);
}
