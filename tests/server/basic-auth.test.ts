import { describe, it, expect } from "vitest";
import { isBasicAuthorized } from "../../server/utils/basicAuth";

const EXPECTED = "staging:correct horse";
const header = (credentials: string) => `Basic ${btoa(credentials)}`;

describe("isBasicAuthorized", () => {
  it("accepts the exact credentials", () => {
    expect(isBasicAuthorized(header(EXPECTED), EXPECTED)).toBe(true);
  });

  it("rejects a wrong password, a prefix and a longer value", () => {
    expect(isBasicAuthorized(header("staging:wrong"), EXPECTED)).toBe(false);
    expect(isBasicAuthorized(header("staging:correct"), EXPECTED)).toBe(false);
    expect(isBasicAuthorized(header(`${EXPECTED}!`), EXPECTED)).toBe(false);
  });

  it("rejects a missing header, another scheme and malformed base64", () => {
    expect(isBasicAuthorized(undefined, EXPECTED)).toBe(false);
    expect(isBasicAuthorized("Bearer abc", EXPECTED)).toBe(false);
    expect(isBasicAuthorized("Basic %%%", EXPECTED)).toBe(false);
  });
});
