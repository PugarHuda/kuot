import { afterEach, describe, expect, it } from "vitest";
import { devTokenOk } from "../authz";

const req = (opts: { token?: string; header?: string } = {}) => {
  const url = opts.token !== undefined ? `https://x.test/api?token=${opts.token}` : "https://x.test/api";
  const headers = new Headers();
  if (opts.header !== undefined) headers.set("x-dev-token", opts.header);
  return new Request(url, { headers });
};

describe("devTokenOk — fail closed", () => {
  afterEach(() => {
    delete process.env.DEV_PAY_TOKEN;
  });

  it("denies when DEV_PAY_TOKEN is unset (never fail open)", () => {
    delete process.env.DEV_PAY_TOKEN;
    expect(devTokenOk(req({ token: "anything" }))).toBe(false);
    expect(devTokenOk(req())).toBe(false);
  });

  it("denies when no token provided", () => {
    process.env.DEV_PAY_TOKEN = "s3cret-value";
    expect(devTokenOk(req())).toBe(false);
  });

  it("denies a wrong token", () => {
    process.env.DEV_PAY_TOKEN = "s3cret-value";
    expect(devTokenOk(req({ token: "nope" }))).toBe(false);
    expect(devTokenOk(req({ token: "s3cret-valuX" }))).toBe(false);
  });

  it("accepts the correct token via query or header", () => {
    process.env.DEV_PAY_TOKEN = "s3cret-value";
    expect(devTokenOk(req({ token: "s3cret-value" }))).toBe(true);
    expect(devTokenOk(req({ header: "s3cret-value" }))).toBe(true);
  });

  it("is length-safe (no throw on mismatched lengths)", () => {
    process.env.DEV_PAY_TOKEN = "short";
    expect(devTokenOk(req({ token: "a-much-longer-provided-token" }))).toBe(false);
  });
});
