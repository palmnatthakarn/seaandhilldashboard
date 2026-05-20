// Error handling utilities

/**
 * Custom API Error class for handling errors in API routes
 */
export class APIError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIError);
    }
  }
}

/**
 * Predefined error types
 */
export const ErrorTypes = {
  BAD_REQUEST: (message: string) => new APIError(message, 400),
  UNAUTHORIZED: (message: string = 'Unauthorized') => new APIError(message, 401),
  FORBIDDEN: (message: string = 'Forbidden') => new APIError(message, 403),
  NOT_FOUND: (message: string) => new APIError(message, 404),
  INTERNAL_SERVER: (message: string = 'Internal Server Error') => new APIError(message, 500),
  DATABASE_ERROR: (message: string = 'Database Error') => new APIError(message, 500),
} as const;

/**
 * Checks if error is an APIError instance
 */
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}

/**
 * Formats error for API response
 */
export function formatErrorResponse(error: unknown) {
  if (isAPIError(error)) {
    return {
      success: false,
      error: error.message,
      statusCode: error.statusCode,
      details: error.details,
      timestamp: new Date().toISOString(),
    };
  }

  // Handle unknown errors
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return {
    success: false,
    error: message,
    statusCode: 500,
    timestamp: new Date().toISOString(),
  };
}

export function getErrorStatusCode(error: unknown) {
  return isAPIError(error) ? error.statusCode : 500;
}

/**
 * Logs error with context
 */
export function logError(error: unknown, context?: string) {
  const prefix = context ? `[${context}]` : '[Error]';

  if (isAPIError(error)) {
    console.error(prefix, `${error.statusCode}:`, error.message, error.details);
  } else if (error instanceof Error) {
    console.error(prefix, error.message, error.stack);
  } else {
    console.error(prefix, 'Unknown error:', error);
  }
}
