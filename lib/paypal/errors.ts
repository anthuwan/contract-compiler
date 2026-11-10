export class PayPalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigurationError";
  }
}

export class PayPalApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly debugId?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      debugId?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "PayPalApiError";
    this.status = options.status;
    this.code = options.code;
    this.debugId = options.debugId;
    this.details = options.details;
  }
}
