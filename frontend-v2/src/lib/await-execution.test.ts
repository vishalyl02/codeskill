import { awaitExecution } from "./await-execution";
describe("queued execution polling", () => {
  it("retains synchronous legacy response shape", async () => {
    const response = { data: { result: { stdout: "hello" } } };
    const poll = jest.fn();
    expect(await awaitExecution(async () => response, poll)).toBe(response);
    expect(poll).not.toHaveBeenCalled();
  });
  it("waits through queued/running states and normalizes queue output for assessment editors", async () => {
    const poll = jest
      .fn()
      .mockResolvedValueOnce({ data: { jobId: "1", status: "active" } })
      .mockResolvedValueOnce({
        data: {
          status: "accepted",
          results: [
            {
              id: "run",
              output: "30",
              error: "",
              executionTime: 2,
              passed: true,
            },
          ],
        },
      });
    const response = await awaitExecution(
      async () => ({ data: { jobId: "1", status: "queued" } }),
      poll,
      { intervalMs: 1 },
    );
    expect(poll).toHaveBeenCalledTimes(2);
    expect(response.data.result.stdout).toBe("30");
    expect(response.data.result.executionTimeMs).toBe(2);
  });
  it("returns a system error from a failed queue job", async () => {
    const response = await awaitExecution(
      async () => ({ data: { jobId: "1" } }),
      async () => ({
        data: { success: false, status: "system_error", results: [] },
      }),
      { intervalMs: 1 },
    );
    expect(response.data.status).toBe("system_error");
    expect(response.data.success).toBe(false);
  });
  it("bounds polling time without clearing source", async () => {
    await expect(
      awaitExecution(async () => ({ data: { jobId: "1" } }), jest.fn(), {
        timeoutMs: 0,
      }),
    ).rejects.toThrow("code has been preserved");
  });
  it("rejects invalid completed response", async () => {
    await expect(
      awaitExecution(
        async () => ({ data: { jobId: "1" } }),
        async () => ({ data: {} }),
        { intervalMs: 1 },
      ),
    ).rejects.toThrow("Unable to retrieve");
  });
});
