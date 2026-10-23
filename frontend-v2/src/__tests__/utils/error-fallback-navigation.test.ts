import { classifyCriticalApiFailure } from "@/lib/error-fallback-navigation";

describe("critical API failure classification", () => {
  const classify = (status?: number, method = "GET", code?: string) =>
    classifyCriticalApiFailure({ status, method, code, hasResponse: status !== undefined });

  it.each([500, 502, 503, 504])("routes HTTP %s to the fallback", (status) => {
    expect(classify(status)).toBe("server");
  });

  it("routes network failures and timeouts to the fallback", () => {
    expect(classify(undefined, "GET", "ERR_NETWORK")).toBe("network");
    expect(classify(408)).toBe("timeout");
    expect(classify(undefined, "GET", "ECONNABORTED")).toBe("timeout");
  });

  it.each([400, 401, 403, 404, 409, 422, 429])("leaves HTTP %s to contextual handling", (status) => {
    expect(classify(status)).toBeNull();
  });

  it("does not redirect failed mutation requests", () => {
    expect(classify(500, "POST")).toBeNull();
    expect(classify(undefined, "DELETE", "ERR_NETWORK")).toBeNull();
  });

  it.each([503, undefined])("keeps the editor open when optional runtime discovery fails (%s)", status => {
    expect(classifyCriticalApiFailure({ status, hasResponse: status !== undefined,
      code: status === undefined ? "ERR_NETWORK" : undefined,
      method: "GET", url: "/execution/runtimes",
    })).toBeNull();
  });
});
