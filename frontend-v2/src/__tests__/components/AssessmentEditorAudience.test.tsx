import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "@/app/admin/assessments/create/page";
import { adminAssessmentsAPI } from "@/config/api";

jest.mock("next/navigation", () => {
  const router = { push: jest.fn() };
  return { useRouter: () => router };
});
jest.mock("@/config/api", () => ({
  adminAssessmentsAPI: {
    getById: jest.fn(),
    getTargetingOptions: jest.fn(),
    previewTargetAudience: jest.fn(),
    update: jest.fn(),
  },
}));

const assessment = {
  title: "Practice assessment",
  code: "EXAM-1",
  requireLockdown: true,
  securityPolicy: {
    allowCalculators: true,
    allowScratchpad: false,
    allowReferenceDoc: true,
    referencePdfUrl: "https://example.invalid/reference.pdf",
  },
  sections: [{
    title: "Section A",
    questions: [{ questionId: { id: "question-1", question: "Practice question" }, marks: 10 }],
  }],
};

beforeEach(() => {
  jest.resetAllMocks();
  window.history.replaceState({}, "", "/admin/assessments/create?id=assessment-1");
  jest.mocked(adminAssessmentsAPI.getTargetingOptions).mockResolvedValue({ data: {} });
  jest.mocked(adminAssessmentsAPI.previewTargetAudience).mockResolvedValue({
    data: { totalCount: 10, accessMode: "open_access", sampleStudents: [{ name: "Sample student" }] },
  });
  jest.mocked(adminAssessmentsAPI.update).mockResolvedValue({ data: {} });
});

it("defaults unrestricted assessments to open access and requires a target before saving with the switch off", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({ data: { assessment } });
  render(<Page />);

  const openAccess = await screen.findByRole("switch", { name: "Eligible to all students" });
  expect(openAccess).toBeChecked();
  expect(await screen.findByText("10 students eligible")).toBeInTheDocument();
  expect(screen.queryByText(/sample eligible candidates|sample student/i)).not.toBeInTheDocument();

  fireEvent.click(openAccess);
  expect(openAccess).not.toBeChecked();
  expect(screen.getByText(/Select a cohort filter or add at least one student before saving/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));
  expect(adminAssessmentsAPI.update).not.toHaveBeenCalled();
});

it("keeps existing questions, cohort restrictions, and saved LockDown settings in the editing flow", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({
    data: { assessment: { ...assessment, targetDepartments: ["Engineering"], targetStudentIds: ["student-1"] } },
  });
  render(<Page />);

  const openAccess = await screen.findByRole("switch", { name: "Eligible to all students" });
  expect(openAccess).not.toBeChecked();
  expect(screen.getByText("Practice question")).toBeInTheDocument();

  fireEvent.click(openAccess);
  expect(openAccess).toBeChecked();
  await waitFor(() => expect(adminAssessmentsAPI.previewTargetAudience).toHaveBeenCalledWith(
    expect.objectContaining({ targetDepartments: [], targetStudentIds: [] }), expect.any(AbortSignal),
  ));

  fireEvent.click(openAccess);
  expect(screen.getByText("Department Engineering")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));
  expect(adminAssessmentsAPI.update).toHaveBeenCalledWith("assessment-1", expect.objectContaining({
    targetDepartments: ["Engineering"],
    targetStudentIds: ["student-1"],
    allowCalculators: true,
    allowScratchpad: false,
    allowReferenceDoc: true,
    referencePdfUrl: "https://example.invalid/reference.pdf",
    sections: [expect.objectContaining({
      questions: [expect.objectContaining({ questionId: "question-1", marks: 10 })],
    })],
  }));
  expect(await screen.findByText("Assessment saved as draft")).toBeInTheDocument();
});

it("opens and closes setting help independently of its checkbox and proctoring mode", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({ data: { assessment } });
  render(<Page />);

  const help = await screen.findByLabelText("Allow In-Dock Scientific Calculator details");
  const description = screen.getByText(/open the in-app scientific calculator/);
  const calculator = screen.getByRole("checkbox", { name: "Allow In-Dock Scientific Calculator" });
  expect(description).not.toBeVisible();
  expect(calculator).toBeChecked();

  fireEvent.click(help);
  expect(description).toBeVisible();
  expect(calculator).toBeChecked();
  fireEvent.click(help);
  expect(description).not.toBeVisible();

  const fullyProctored = screen.getByRole("button", { name: /Fully Proctored/ });
  const partialProctored = screen.getByRole("button", { name: /Partial Proctored/ });
  fireEvent.click(screen.getByLabelText("Partial Proctored details"));
  expect(screen.getByText(/Manual submission guaranteed/)).toBeVisible();
  expect(fullyProctored).toHaveAttribute("aria-pressed", "true");
  expect(partialProctored).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(partialProctored);
  expect(partialProctored).toHaveAttribute("aria-pressed", "true");
});

it("highlights the current section when scrolling or choosing a section link", async () => {
  const tops: Record<string, number> = {
    "basic-information": 15,
    configuration: 325,
    "desktop-security": 690,
    "student-access": 1300,
    "result-visibility": 1920,
    "assessment-sections": 2300,
  };
  let scrollPosition = 0;
  const positions = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: this.tagName === "MAIN" ? 100 : 100 + (tops[this.id] ?? 0) - scrollPosition } as DOMRect;
  });
  try {
    jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({ data: { assessment } });
    render(<main><Page /></main>);
    const scroller = screen.getByRole("main");
    const basic = await screen.findByRole("link", { name: "Basic Information" });
    const security = screen.getByRole("link", { name: "Desktop Security & LockDown Browser" });
    const questions = screen.getByRole("link", { name: "Assessment Sections" });

    expect(basic).toHaveAttribute("aria-current", "location");
    scrollPosition = 720;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(security).toHaveAttribute("aria-current", "location"));
    expect(basic).not.toHaveAttribute("aria-current");

    fireEvent.click(questions);
    expect(questions).toHaveAttribute("aria-current", "location");
    expect(questions).toHaveAttribute("href", "#assessment-sections");
    expect(security).not.toHaveAttribute("aria-current");
  } finally {
    positions.mockRestore();
  }
});
