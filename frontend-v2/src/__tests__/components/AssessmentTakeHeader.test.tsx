import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssessmentTakeHeader } from "@/components/assessment/AssessmentTakeHeader";

const mockLockdownBadge = jest.fn();
jest.mock("lucide-react", () => ({
  ...jest.requireActual("lucide-react"),
  ShieldCheck: () => { mockLockdownBadge(); return null; },
}));

it("keeps integrity badges stable through editor, timer, and autosave updates", () => {
  const onSubmit = jest.fn();
  const props = {
    questionNumber: 1, totalQuestionCount: 2, assessmentCode: "CODE", topic: "Basics",
    isLockdownActive: true, showPenalty: true, totalPenaltyMarks: 0, violationCount: 0,
    timeRemaining: "10:00", isTimeCritical: false, isQuestionTimeCritical: false,
    syncStatus: "synced" as const, pendingSyncCount: 0, isFullscreen: true, enforceFullscreen: true,
    tabSwitches: 0, maxTabSwitches: 3, submitDisabled: false,
    onToggleSidebar: jest.fn(), onToggleFullscreen: jest.fn(), onSubmit,
  };
  const { rerender } = render(<AssessmentTakeHeader {...props} />);
  mockLockdownBadge.mockClear();

  rerender(<AssessmentTakeHeader {...props} />);
  rerender(<AssessmentTakeHeader {...props} timeRemaining="09:59" syncStatus="syncing" />);
  expect(mockLockdownBadge).not.toHaveBeenCalled();
  expect(screen.getByText("09:59")).toBeInTheDocument();
  expect(screen.getByText("Syncing...")).toBeInTheDocument();
  expect(screen.getByText("Penalty: -0")).toBeInTheDocument();

  rerender(<AssessmentTakeHeader {...props} totalPenaltyMarks={2} violationCount={1} />);
  expect(screen.getByText("Penalty: -2")).toBeInTheDocument();
  expect(screen.getByText("(1 violation)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Submit Test" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
