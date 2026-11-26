import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import AdminAssessmentsPage from "@/app/admin/assessments/page";
import AdminAssessmentPreviewPage from "@/app/admin/assessments/[id]/preview/page";
import { adminAssessmentsAPI } from "@/config/api";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "exam-123" }),
}));

jest.mock("@/config/api", () => ({
  __esModule: true,
  default: {},
  adminAssessmentsAPI: { getAll: jest.fn(), getById: jest.fn() },
}));

jest.mock("@/lib/lockdown-bridge", () => ({
  isLockdownClient: () => false,
}));

const assessment = {
  _id: "exam-123",
  title: "Code Test",
  durationMinutes: 30,
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
});

it("shows the shared setup card for a restricted assessment using the admin API", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({
    data: { assessment: { ...assessment, securityPolicy: { secureExamMode: "STANDARD" } } },
  });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("heading", { name: "CodeSkill LockDown required" })).toBeInTheDocument();
  expect(adminAssessmentsAPI.getById).toHaveBeenCalledWith("exam-123");
  expect(screen.getByRole("button", { name: "Download for macOS" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Run system check" })).toHaveAttribute(
    "href", expect.stringContaining("codeskill-lockdown://system-check"),
  );
  const launch = screen.getByRole("link", { name: "Launch in CodeSkill LockDown" });
  const launchUrl = new URL(launch.getAttribute("href")!);
  expect(launchUrl.protocol).toBe("codeskill-lockdown:");
  expect(launchUrl.hostname).toBe("system-check");
  expect(launchUrl.searchParams.has("token")).toBe(false);
  expect(screen.getByText("Return to this page and select Launch in CodeSkill LockDown.")).toBeInTheDocument();
});

it("shows the read-only briefing for an assessment without LockDown", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockResolvedValue({ data: { assessment } });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("heading", { name: "Code Test" })).toBeInTheDocument();
  expect(screen.getByText("Read the questions carefully.")).toBeInTheDocument();
  expect(screen.queryByText("CodeSkill LockDown required")).not.toBeInTheDocument();
});

it("shows the admin API's access refusal without falling back to the student page", async () => {
  jest.mocked(adminAssessmentsAPI.getById).mockRejectedValue({ response: { status: 403 } });

  render(<AdminAssessmentPreviewPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Your admin account does not have access");
  expect(screen.getByRole("link", { name: "Back to Assessments" })).toHaveAttribute("href", "/admin/assessments");
});
