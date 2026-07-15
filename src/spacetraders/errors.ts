export class UpstreamError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.statusCode = statusCode;
  }
}
