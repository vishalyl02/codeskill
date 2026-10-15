import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import Page from "@/app/assessments/page";
import { useAuth } from "@/context/AuthContext";
import { studentAssessmentsAPI } from "@/config/api";
const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/config/api", () => ({ studentAssessmentsAPI: { getMyAssessments: jest.fn(), retakeAttempt: jest.fn() } }));
const types = ["DSA", "MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "CODE_OUTPUT"];
const labels = ["Coding Problem", "MCQ", "Multiple Choice", "True/False", "Code Output"];
const fixtures = types.map((type, index) => ({ _id: `assessment-${index}`, title: `${labels[index]} Test`, description: `Description ${index}`,
  questionTypes: [type], difficulties: [index === 0 ? "hard" : "easy"], type: "mcq", durationMinutes: 30 + index,
  questionCount: 5 + index, totalMarks: 50 + index, status: "published", attemptStatus: "not_started" }));
const load = jest.mocked(studentAssessmentsAPI.getMyAssessments);
const auth = jest.mocked(useAuth);
beforeEach(() => { jest.clearAllMocks(); auth.mockReturnValue({ user: { id: "student", name: "Candidate" }, loading: false } as ReturnType<typeof useAuth>); load.mockResolvedValue({ data: { assessments: fixtures } }); });
it("renders every configured type with its actual metadata, icon and assessment route", async () => {
  render(<Page />); await screen.findByRole("heading", { name: "Coding Problem Test" });
  fixtures.forEach((item, index) => {
    const card = screen.getByRole("heading", { name: item.title }).closest("article")!;
    expect(within(card).getByLabelText(`${labels[index]} assessment`)).toBeInTheDocument();
    expect(within(card).getByText(labels[index], { exact: true })).toBeInTheDocument();
    expect(within(card).getByText(`${30 + index} mins`)).toBeInTheDocument(); expect(within(card).getByText(`${50 + index} pts`)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Attempt Now" })).toHaveAttribute("href", `/assessments/assessment-${index}`);
    expect(within(card).getByText("Live", { exact: true })).toBeInTheDocument();
  });
});
it("supports title search, grouped MCQ tabs, availability and difficulty filters", async () => {
  render(<Page />); await screen.findByRole("heading", { name: "Coding Problem Test" });
  fireEvent.click(screen.getByRole("button", { name: "MCQs", exact: true })); expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.change(screen.getByRole("textbox", { name: "Search assessments" }), { target: { value: "Multiple" } }); expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Search assessments" }), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "All Assessments" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Difficulty" }), { target: { value: "Hard" } }); expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.change(screen.getByRole("combobox", { name: "Availability" }), { target: { value: "Upcoming" } }); expect(screen.getByText("No assessments match your filters.")).toBeInTheDocument();
});
it.each(["upcoming", "ended", "draft"])("does not offer attempts for %s assessments", async state => {
  load.mockResolvedValue({ data: { assessments: [{ ...fixtures[0], ...(state === "upcoming" ? { startTime: new Date(Date.now() + 60000).toISOString() } : state === "ended" ? { endTime: new Date(Date.now() - 1000).toISOString() } : { status: "draft" }) }] } });
  render(<Page />); await screen.findByRole("heading", { name: "Coding Problem Test" });
  expect(screen.queryByRole("link", { name: "Attempt Now" })).toBeNull();
});
it("preserves scorecards and routes permitted retakes through the secure assessment gate", async () => {
  load.mockResolvedValue({ data: { assessments: [{ ...fixtures[0], attemptStatus: "auto_submitted", canRetake: true, attemptScore: 0 }] } });
  render(<Page />); fireEvent.click(await screen.findByRole("button", { name: "Re-attempt" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/assessments/assessment-0"));
  expect(studentAssessmentsAPI.retakeAttempt).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Scorecard" })).toHaveAttribute("href", "/assessments/assessment-0/result");
});
it("shows API errors and retries instead of a false empty state", async () => {
  load.mockRejectedValueOnce(new Error("Offline")); render(<Page />); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByRole("heading", { name: "Coding Problem Test" });
});
it("keeps unauthenticated users behind the existing student sign-in flow", async () => {
  auth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>); render(<Page />);
  expect(await screen.findByRole("link", { name: "Student Sign In" })).toHaveAttribute("href", "/login?redirect=/assessments"); expect(load).not.toHaveBeenCalled();
});
