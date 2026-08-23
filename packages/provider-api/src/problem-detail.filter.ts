import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Renders errors as `{ title, detail }`.
 *
 * Nest's default error body is `{ statusCode, message, error }`. The dashboard
 * reads `detail`. Without this filter the 404 interaction in the contract fails
 * verification — which is exactly the kind of mismatch that otherwise ships and
 * shows up as a blank error page in production, because almost nobody writes an
 * end-to-end test for a 404 body.
 */
@Catch()
export class ProblemDetailFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      title: TITLES[status] ?? 'Request failed',
      detail: detailOf(exception),
    });
  }
}

const TITLES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Invalid request',
  [HttpStatus.NOT_FOUND]: 'Order not found',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Order cannot be placed',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Unexpected error',
};

function detailOf(exception: unknown): string {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return 'The request could not be completed.';
}
