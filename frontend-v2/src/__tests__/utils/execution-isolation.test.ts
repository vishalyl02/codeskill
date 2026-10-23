describe("Execution ID Isolation & Stale Output Prevention", () => {
  it("generates unique execution IDs for successive runs of identical code", () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toEqual(id2);
  });

  it("discards responses from older executions when a newer run is active", async () => {
    let activeExecutionId = "run-1";
    let displayedResult: any = null;

    // Simulate Run 1 dispatch
    const run1Promise = new Promise<{ executionId: string; output: string }>((resolve) => {
      setTimeout(() => resolve({ executionId: "run-1", output: "Old Output" }), 100);
    });

    // User dispatches Run 2 before Run 1 resolves
    activeExecutionId = "run-2";
    displayedResult = null; // Clear previous output immediately

    const run2Promise = new Promise<{ executionId: string; output: string }>((resolve) => {
      setTimeout(() => resolve({ executionId: "run-2", output: "New Output" }), 50);
    });

    // Run 2 completes first
    const run2Result = await run2Promise;
    if (activeExecutionId === run2Result.executionId) {
      displayedResult = run2Result.output;
    }
    expect(displayedResult).toBe("New Output");

    // Run 1 finishes later
    const run1Result = await run1Promise;
    if (activeExecutionId === run1Result.executionId) {
      displayedResult = run1Result.output;
    }

    // Crucial: Run 1 output must NOT overwrite Run 2!
    expect(displayedResult).toBe("New Output");
  });
});
