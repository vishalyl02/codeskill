import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import ExecutionFeedback from "@/components/Result/ExecutionFeedback";
import { ExecutionFeedbackResult } from "@/lib/submission-feedback";

const result: ExecutionFeedbackResult = {
  status: "wrong_answer",
  passedCount: 3,
  totalCount: 5,
  runtime: 0,
  memory: 12.5,
  results: [
    {
      id: "abc",
      passed: true,
      input: "PASSED-INPUT",
      output: "PASSED-OUTPUT",
      expected: "PASSED-EXPECTED",
    },
    {
      id: "bbcd",
      passed: false,
      isHidden: true,
      input: "SECRET-INPUT",
      output: "SECRET-OUTPUT",
      expected: "SECRET-EXPECTED",
      error: "SECRET-ERROR",
    },
  ],
};

it.each(["practice", "assessment"] as const)(
  "%s puts test cases before runtime and memory",
  (context) => {
    render(
      <ExecutionFeedback
        result={result}
        context={context}
        mode="submission"
        language="python"
      />,
    );
    const cases = screen.getByLabelText("Test case results");
    expect(
      cases.compareDocumentPosition(screen.getByText("Runtime · total")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      cases.compareDocumentPosition(screen.getByText("Memory · peak")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
);
it("assessment hides every hidden case field even if a malformed response includes it", () => {
  const { container } = render(
    <ExecutionFeedback
      result={result}
      context="assessment"
      mode="submission"
      language="python"
    />,
  );
  expect(screen.getByRole("button", { name: "Test Case 1" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /abc|bbcd/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Test Case 2/ }));
  expect(container.textContent).not.toContain("SECRET");
  expect(screen.getByText(/Details are private/)).toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: "Test cases passed" }),
  ).toHaveAttribute("aria-valuenow", "3");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
  expect(screen.getByText("3 / 5")).toBeInTheDocument();
});
it("practice submission shows failed hidden input, expected output, actual output and error only", () => {
  const { container } = render(
    <ExecutionFeedback
      result={result}
      context="practice"
      mode="submission"
      language="python"
    />,
  );
  expect(screen.getByText("SECRET-INPUT")).toBeInTheDocument();
  expect(screen.getByText("SECRET-OUTPUT")).toBeInTheDocument();
  expect(screen.getByText("SECRET-EXPECTED")).toBeInTheDocument();
  expect(screen.getByText("SECRET-ERROR")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Case abc/ }),
  ).not.toBeInTheDocument();
  expect(container.textContent).not.toContain("PASSED-");
  expect(screen.getByText("0 ms")).toBeInTheDocument();
});
it("sample runs retain passed sample details", () => {
  render(
    <ExecutionFeedback
      result={result}
      context="practice"
      mode="run"
      language="python"
    />,
  );
  expect(screen.getByText("PASSED-INPUT")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Case abc/ })).toBeInTheDocument();
});
it("uses server comparison values and shows no successful hidden cases", () => {
  const accepted = {
    ...result,
    status: "accepted",
    passedCount: 5,
    results: result.results.map((test) => ({ ...test, passed: true })),
    comparison: { runtime: { percentile: 66.7, sampleSize: 3 }, memory: null },
  };
  const { container } = render(
    <ExecutionFeedback
      result={accepted}
      context="practice"
      mode="submission"
      language="python"
    />,
  );
  expect(
    screen.getByText("Faster than 66.7% · 3 students"),
  ).toBeInTheDocument();
  expect(container.textContent).not.toContain("SECRET");
  expect(screen.getByText(/No failing cases to inspect/)).toBeInTheDocument();
});
it("does not invent measurements or peer percentages when data is unavailable", () => {
  render(
    <ExecutionFeedback
      result={{ ...result, runtime: undefined, memory: undefined, results: [] }}
      context="practice"
      mode="submission"
      language="python"
    />,
  );
  expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  expect(screen.getAllByText("Comparison unavailable")).toHaveLength(2);
  expect(screen.queryByText("0 ms")).not.toBeInTheDocument();
});
it("shows a pending state instead of a stale verdict or fabricated progress", () => {
  render(
    <ExecutionFeedback
      result={result}
      phase="queued"
      context="practice"
      mode="submission"
      language="python"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a judge");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByText("Wrong answer")).not.toBeInTheDocument();
});
it("shows assessment comparison as a pass-count comparison against graded candidates", () => {
  render(
    <ExecutionFeedback
      result={{
        ...result,
        comparison: { score: { percentile: 75, sampleSize: 4 } },
      }}
      context="assessment"
      mode="submission"
      language="python"
    />,
  );
  expect(
    screen.getByText("More test cases passed than 75% of 4 other candidates."),
  ).toBeInTheDocument();
});
