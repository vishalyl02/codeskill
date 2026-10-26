import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ModuleCompletionModal } from "@/components/learning/ModuleCompletionModal";

describe("ModuleCompletionModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <ModuleCompletionModal
        isOpen={false}
        onClose={jest.fn()}
        reasons={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders completion reasons and criteria breakdown when open", () => {
    const onClose = jest.fn();
    const onNavigateTab = jest.fn();

    render(
      <ModuleCompletionModal
        isOpen={true}
        onClose={onClose}
        title="Module Incomplete"
        reasons={[
          "Study time requirement not met: You must spend at least 30 seconds on this module before completing (18s remaining).",
          "Quiz not passed: Please complete the required module quiz with a passing score of at least 70%.",
        ]}
        criteria={{
          timeSpent: 12,
          requiredTime: 30,
          timeRemaining: 18,
          timeMet: false,
          quizMet: false,
          codingMet: true,
        }}
        onNavigateTab={onNavigateTab}
      />,
    );

    expect(screen.getByText("Module Incomplete")).toBeInTheDocument();
    expect(screen.getByText(/12s \/ 30s/)).toBeInTheDocument();
    expect(screen.getByText(/18s remaining engagement needed/)).toBeInTheDocument();
    expect(screen.getByText(/Module Concept Quiz/)).toBeInTheDocument();
    expect(screen.getByText("Take Quiz")).toBeInTheDocument();
    expect(screen.getByText(/All coding test cases executed and passed/)).toBeInTheDocument();

    // Clicking "Take Quiz" navigates to quiz tab
    fireEvent.click(screen.getByText("Take Quiz"));
    expect(onNavigateTab).toHaveBeenCalledWith("quiz");
  });

  it("allows closing the modal via the acknowledge button", () => {
    const onClose = jest.fn();
    render(
      <ModuleCompletionModal
        isOpen={true}
        onClose={onClose}
        reasons={["Test reason"]}
      />,
    );

    fireEvent.click(screen.getByText("I Understand, Continue"));
    expect(onClose).toHaveBeenCalled();
  });
});
