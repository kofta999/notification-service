export class NotificationError extends Error {
  public override readonly cause?: Error;
  public readonly retryable?: boolean;

  constructor(
    message: string,
    options: { cause?: Error; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.cause = options.cause;
    this.retryable = options.retryable;
  }
}

export class ThirdPartyProviderError extends NotificationError {
  constructor(
    message: string,
    options: { cause?: Error; retryable?: boolean } = {},
  ) {
    super(message, options);
  }
}

export class InvalidPayloadError extends NotificationError {
  constructor(
    message: string,
    options: { cause?: Error; retryable?: boolean } = {},
  ) {
    super(message, { ...options, retryable: false });
  }
}

export class ReconciliationError extends NotificationError {
  constructor(
    message: string,
    options: { cause?: Error; retryable?: boolean } = {},
  ) {
    super(message, { ...options, retryable: false });
  }
}
