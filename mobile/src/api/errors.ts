export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    const message =
      typeof detail === "string" ? detail : `Request failed (${status})`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// Thrown on HTTP 402 — the caller opens the paywall.
export class PaymentRequiredError extends ApiError {
  constructor(detail: unknown = "Subscription required") {
    super(402, detail);
    this.name = "PaymentRequiredError";
  }
}

export function isPaymentRequired(e: unknown): e is PaymentRequiredError {
  return e instanceof ApiError && e.status === 402;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
