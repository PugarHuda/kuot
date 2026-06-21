import { describe, it, expect } from "vitest";
import { sanitizeDecimal, sanitizeInteger, uniqueWorkIds } from "../format";

describe("sanitizeDecimal", () => {
  it("strips leading zeros (the '000.1' bug)", () => {
    expect(sanitizeDecimal("000.1")).toBe("0.1");
    expect(sanitizeDecimal("007")).toBe("7");
    expect(sanitizeDecimal("00")).toBe("0");
  });
  it("keeps a valid single decimal", () => {
    expect(sanitizeDecimal("0.1")).toBe("0.1");
    expect(sanitizeDecimal("10")).toBe("10");
    expect(sanitizeDecimal("0.")).toBe("0."); // mid-typing is allowed
  });
  it("collapses multiple dots to one", () => {
    expect(sanitizeDecimal("1.2.3")).toBe("1.23");
    expect(sanitizeDecimal("..5")).toBe(".5");
  });
  it("drops non-numeric characters", () => {
    expect(sanitizeDecimal("12abc.5x")).toBe("12.5");
    expect(sanitizeDecimal("-3")).toBe("3");
  });
});

describe("sanitizeInteger", () => {
  it("keeps digits only, no leading zeros", () => {
    expect(sanitizeInteger("0024")).toBe("24");
    expect(sanitizeInteger("24h")).toBe("24");
    expect(sanitizeInteger("0")).toBe("0");
    expect(sanitizeInteger("1.5")).toBe("15");
  });
});

describe("uniqueWorkIds", () => {
  it("dedupes and drops falsy", () => {
    expect(uniqueWorkIds(["a", "a", "b", "", undefined, null, "b"])).toEqual(["a", "b"]);
  });
  it("returns empty for all-falsy", () => {
    expect(uniqueWorkIds([undefined, "", null])).toEqual([]);
  });
});
