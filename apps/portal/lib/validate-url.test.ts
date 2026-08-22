import { describe, expect, it } from "vitest";
import { isHttpUrl } from "./validate-url";

describe("isHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("https://localhost:3001/some/path?x=1")).toBe(true);
  });

  it("rejects javascript: URLs (the stored-XSS vector)", () => {
    expect(isHttpUrl("javascript:alert(document.cookie)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects other non-http(s) schemes", () => {
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed or empty input", () => {
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});
