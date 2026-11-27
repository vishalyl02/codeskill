import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminAssessmentsPage from "@/app/admin/assessments/page";
import AdminAssessmentPreviewPage from "@/app/admin/assessments/[id]/preview/page";
import { adminAssessmentsAPI, studentAssessmentsAPI } from "@/config/api";

const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "exam-123" }),
  useRouter: () => mockRouter,
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin", isAdmin: true }, loading: false }),
}));

jest.mock("@/config/api", () => ({
  __esModule: true,
  default: {},
  adminAssessmentsAPI: { getAll: jest.fn(), getById: jest.fn() },
  studentAssessmentsAPI: { getOverview: jest.fn() },
}));

jest.mock("@/lib/lockdown-bridge", () => ({
  isLockdownClient: () => false,
}));

const assessment = {
  _id: "exam-123",
  title: "Code Test",
  durationMinutes: 30,
  code: "TEST",
  status: "published",
  allowedAttempts: 1,
  passingMarks: 10,
  proctoring: { useCamera: false, useMicrophone: false },
  totalMarks: 20,
  instructions: ["Read the questions carefully."],
};

const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ version: "1.0.0" }),
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

it("opens the admin card preview in the current tab", async () => {
  jest.mocked(adminAssessmentsAPI.getAll).mockResolvedValue({
    data: { assessments: [assessment] },
  });

  render(<AdminAssessmentsPage />);

  const preview = await screen.findByRole("link", { name: "Preview Code Test" });
  expect(preview).toHaveAttribute("href", "/admin/assessments/exam-123/preview");
  expect(preview).not.toHaveAttribute("target", "_blank");
  expect(screen.getByRole("button", { name: "Copy Candidate Link" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Student link" })).toHaveAttribute("href", "/assessments/exam-123");
});

it.each(["MCQ", "CODING", "MIXED"])("shows the student LockDown setup for %s using the admin API", async (type) => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({
    data: { assessment: { ...assessment, type, securityPolicy: { secureExamMode: "STANDARD" } } },
  });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("heading", { name: "CodeSkill LockDown required" })).toBeInTheDocument();
  expect(adminAssessmentsAPI.getById).toHaveBeenCalledWith("exam-123");
  expect(screen.getByRole("button", { name: "Download for macOS" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Run system check" })).toHaveAttribute(
    "href", expect.stringContaining("codeskill-lockdown://system-check"),
  );
  expect(screen.getByRole("button", { name: "Launch in CodeSkill LockDown" })).toBeEnabled();
  expect(screen.queryByRole("link", { name: "Launch in CodeSkill LockDown" })).not.toBeInTheDocument();
  expect(screen.getByText("Return to this page and select Launch in CodeSkill LockDown.")).toBeInTheDocument();
});

it.each(["MCQ", "CODING", "MIXED"])("shows the full student briefing for %s without LockDown", async (type) => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({
    data: { assessment: { ...assessment, type, questions: [{ id: "q1" }, { id: "q2" }] } },
  });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("heading", { name: "Code Test" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Examination Rules & Integrity Notice" })).toBeInTheDocument();
  expect(screen.getByText("Read the questions carefully.")).toBeInTheDocument();
  expect(screen.getByText("2 Questions")).toBeInTheDocument();
  expect(screen.getByText("10 pts")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  expect(studentAssessmentsAPI.getOverview).not.toHaveBeenCalled();

  const begin = screen.getByRole("button", { name: "Begin Assessment" });
  expect(begin).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(begin).toBeEnabled();
  fireEvent.click(begin);
  expect(screen.getByText(/Preview complete/)).toBeInTheDocument();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it("uses the student device-check section and available state for a proctored briefing", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({
    data: { assessment: { ...assessment, proctoring: { useCamera: true, useMicrophone: true } } },
  });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("heading", { name: "Camera & microphone check" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable camera & microphone" })).toBeInTheDocument();
  expect(screen.getByText("Available Now")).toBeInTheDocument();
});

it("shows a draft as closed within the student briefing", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({
    data: { assessment: { ...assessment, status: "draft" } },
  });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("heading", { name: "Code Test" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Assessment Closed" })).toBeDisabled();
});

it("shows the admin API's access refusal without falling back to the student page", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockRejectedValue({ response: { status: 403 } });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Your admin account does not have access");
  expect(screen.getByRole("link", { name: "Back to Assessments" })).toHaveAttribute("href", "/admin/assessments");
});

it("handles an expired admin session without rendering student sign-in", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockRejectedValue({ response: { status: 401 } });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Your admin session has expired");
  expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  expect(studentAssessmentsAPI.getOverview).not.toHaveBeenCalled();
});
