/**
 * Thrown inside a route handler (often within a `$transaction`) to signal a
 * specific HTTP status + message that should be returned to the client,
 * distinct from an unexpected error that should surface as a 500.
 */
export class RouteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
