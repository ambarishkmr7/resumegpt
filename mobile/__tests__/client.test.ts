import { api, authHeaders, configureAuth } from "../src/api/client";
import { ApiError, isPaymentRequired, PaymentRequiredError } from "../src/api/errors";

const originalFetch = global.fetch;

function mockFetch(status: number, body: unknown, contentType = "application/json") {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    json: () => Promise.resolve(body),
  } as unknown as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  global.fetch = originalFetch;
  configureAuth({ getToken: () => null, onUnauthorized: () => {} });
});

describe("auth headers", () => {
  it("attaches the bearer token when present", () => {
    configureAuth({ getToken: () => "tok123", onUnauthorized: () => {} });
    expect(authHeaders()).toEqual({ Authorization: "Bearer tok123" });
  });

  it("is empty when logged out", () => {
    expect(authHeaders()).toEqual({});
  });

  it("sends the token on API calls", async () => {
    configureAuth({ getToken: () => "tok123", onUnauthorized: () => {} });
    const fn = mockFetch(200, []);
    await api.listResumes();
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/resumes");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer tok123",
    });
  });
});

describe("error mapping", () => {
  it("throws ApiError with backend detail", async () => {
    mockFetch(400, { detail: "Bad thing" });
    await expect(api.listResumes()).rejects.toThrow("Bad thing");
  });

  it("fires onUnauthorized for 401 with a stale token", async () => {
    const onUnauthorized = jest.fn();
    configureAuth({ getToken: () => "expired", onUnauthorized });
    mockFetch(401, { detail: "Token expired" });
    await expect(api.me()).rejects.toThrow(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onUnauthorized for 401 when logged out", async () => {
    const onUnauthorized = jest.fn();
    configureAuth({ getToken: () => null, onUnauthorized });
    mockFetch(401, { detail: "Bad credentials" });
    await expect(api.login("a@b.c", "wrong")).rejects.toThrow("Bad credentials");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("maps 402 to PaymentRequiredError", async () => {
    configureAuth({ getToken: () => "tok", onUnauthorized: () => {} });
    mockFetch(402, { detail: "Subscription required" });
    try {
      await api.usageSummary();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentRequiredError);
      expect(isPaymentRequired(e)).toBe(true);
    }
  });
});

describe("login payload", () => {
  it("posts JSON to /api/auth/login-json", async () => {
    const fn = mockFetch(200, { access_token: "t", user: { id: "1", email: "a@b.c" } });
    await api.login("a@b.c", "secret");
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toContain("/api/auth/login-json");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: "a@b.c",
      password: "secret",
    });
  });
});

describe("WebSocket URL builder", () => {
  it("swaps http for ws and carries the token as a query param", () => {
    configureAuth({ getToken: () => "tok/=+", onUnauthorized: () => {} });
    const url = api.liveInterviewWsUrl("resume123");
    expect(url).toMatch(/^ws/);
    expect(url).toContain("/api/resumes/mock-interview-live/resume123");
    expect(url).toContain(`?token=${encodeURIComponent("tok/=+")}`);
  });
});
