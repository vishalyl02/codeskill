import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProblemsPage from "@/app/problems/page";
import { problemsAPI } from "@/config/api";

jest.mock("@/config/api", () => ({ problemsAPI: { getAll: jest.fn() } }));
const getAll = jest.mocked(problemsAPI.getAll);
type Response = Awaited<ReturnType<typeof problemsAPI.getAll>>;
const response = { data: { data: [{ id: "public-one", title: "Two Sum", slug: "two-sum", difficulty: "easy", categories: ["Arrays"], stats: { acceptanceRate: 45 } }], total: 42, page: 1, totalPages: 3 } } as Response;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  getAll.mockResolvedValue(response);
});
afterEach(() => { jest.useRealTimers(); });

it("loads public problems for a guest and renders canonical IDs, difficulty, category, and pagination", async () => {
  render(<ProblemsPage />);
  expect(screen.getByRole("status", { name: "Loading problems" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Two Sum" })).toHaveAttribute("href", "/problems/two-sum");
  expect(getAll).toHaveBeenCalledWith(1, 20, "", "All Topics", expect.any(AbortSignal));
  expect(screen.getByText("Easy", { selector: "span.difficulty" })).toHaveClass("difficulty", "easy");
  expect(screen.getByText("45%")).toBeInTheDocument();
  expect(screen.getByText("42")).toBeInTheDocument();
  expect(screen.queryByText("No problems found matching your criteria.")).not.toBeInTheDocument();
});

it("displays errors separately from empty results and recovers on retry", async () => {
  getAll.mockRejectedValueOnce(new Error("Unavailable"));
  render(<ProblemsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Problems could not be loaded");
  expect(screen.queryByText("No problems found matching your criteria.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("link", { name: "Two Sum" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getAll).toHaveBeenCalledTimes(2);
});

it("shows the existing empty message only after a successful empty response", async () => {
  getAll.mockResolvedValueOnce({ data: { data: [], total: 0, pages: 0 } } as Response);
  render(<ProblemsPage />);
  expect(await screen.findByText("No problems found matching your criteria.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("makes a malformed response recoverable and avoids links for records without a slug", async () => {
  getAll.mockResolvedValueOnce({ data: { message: "Unexpected envelope" } } as Response);
  getAll.mockResolvedValueOnce({ data: [{ _id: "one", title: "No Slug", difficulty: "hard" }] } as Response);
  render(<ProblemsPage />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No Slug")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "No Slug" })).not.toBeInTheDocument();
  expect(screen.getByText("Hard", { selector: "span.difficulty" })).toHaveClass("difficulty", "hard");
});

it("resets to page one when the topic changes", async () => {
  render(<ProblemsPage />);
  await screen.findByRole("link", { name: "Two Sum" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(getAll).toHaveBeenLastCalledWith(2, 20, "", "All Topics", expect.any(AbortSignal)));
  await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Trees" }));
  await waitFor(() => expect(getAll).toHaveBeenLastCalledWith(1, 20, "", "Trees", expect.any(AbortSignal)));
  expect(screen.getByRole("button", { name: "Trees" })).toHaveAttribute("aria-pressed", "true");
});

it("debounces search and resets its pagination", async () => {
  jest.useFakeTimers();
  render(<ProblemsPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await act(async () => {});
  expect(getAll).toHaveBeenLastCalledWith(2, 20, "", "All Topics", expect.any(AbortSignal));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search problems" }), { target: { value: "  trees  " } });
  expect(getAll).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(301); });
  expect(getAll).toHaveBeenLastCalledWith(1, 20, "trees", "All Topics", expect.any(AbortSignal));
});

it("ignores old responses after a filter change and cancels requests on unmount", async () => {
  let resolveOld!: (value: Response) => void;
  getAll.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  getAll.mockResolvedValueOnce({ data: { data: [{ id: "tree", slug: "tree-path", title: "Tree Paths", difficulty: "medium" }], total: 1, totalPages: 1 } } as Response);
  const { unmount } = render(<ProblemsPage />);
  const oldSignal = getAll.mock.calls[0][4]!;
  fireEvent.click(screen.getByRole("button", { name: "Trees" }));
  expect(await screen.findByRole("link", { name: "Tree Paths" })).toBeInTheDocument();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { resolveOld(response); });
  expect(screen.queryByText("Two Sum")).not.toBeInTheDocument();
  const activeSignal = getAll.mock.calls[1][4]!;
  unmount();
  expect(activeSignal.aborted).toBe(true);
});

it("works after React Strict Mode effect replay", async () => {
  render(<React.StrictMode><ProblemsPage /></React.StrictMode>);
  expect(await screen.findByRole("link", { name: "Two Sum" })).toBeInTheDocument();
  expect(getAll.mock.calls[0][4]?.aborted).toBe(true);
  expect(getAll.mock.calls[1][4]?.aborted).toBe(false);
});
