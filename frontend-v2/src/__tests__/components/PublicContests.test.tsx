import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Page from "@/app/contests/page";
import Leaderboard from "@/app/contests/leaderboard/page";
import api from "@/config/api";
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/config/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = jest.mocked(api.get);
const now = Date.now();
const fixtures = ["Upcoming", "Live", "Completed"].map((state, index) => ({ id: `id-${index}`, slug: `contest-${index}`, title: `${state} Contest`, description: `Contest description ${index}`, problems: ["one", "two"], startTime: new Date(now + (index === 0 ? 60000 : -120000)).toISOString(), endTime: new Date(now + (index === 2 ? -1000 : 3600000)).toISOString() }));
beforeEach(() => { jest.clearAllMocks(); get.mockImplementation(async url => ({ data: String(url).endsWith("/leaderboard") ? { leaderboard: [{ rank: 1, name: "Real Candidate", username: "candidate", solved: 2, totalProblems: 2 }] } : fixtures })); });
it("renders persisted contests with separate statuses and canonical detail URLs", async () => {
  render(<Page />); await screen.findByRole("heading", { name: "Live Contest" });
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getAllByRole("link", { name: "View contest" }).map(link => link.getAttribute("href"))).toEqual(["/contests/contest-0", "/contests/contest-1", "/contests/contest-2"]);
  fireEvent.click(screen.getByRole("button", { name: /^Live/ })); expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Search contests" }), { target: { value: "No match" } }); expect(screen.getByText("No contests found matching your criteria.")).toBeInTheDocument();
});
it("refreshes on focus and cancels requests on navigation", async () => {
  const { unmount } = render(<Page />); await screen.findByRole("heading", { name: "Live Contest" });
  fireEvent(window, new Event("focus")); await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  const signal = get.mock.calls[1][1]?.signal as AbortSignal; unmount(); expect(signal.aborted).toBe(true);
});
it("shows a recoverable API error without fake empty results", async () => {
  get.mockRejectedValueOnce(new Error("Offline")); render(<Page />); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByRole("heading", { name: "Live Contest" });
});
it("loads real contest rankings separately and switches the selected contest", async () => {
  render(<Leaderboard />); await screen.findAllByText("Real Candidate"); expect(screen.queryByRole("article")).toBeNull();
  expect(get).toHaveBeenCalledWith("/contests/contest-0/leaderboard", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  fireEvent.change(screen.getByRole("combobox", { name: "Choose a contest" }), { target: { value: "contest-1" } });
  await waitFor(() => expect(get).toHaveBeenCalledWith("/contests/contest-1/leaderboard", expect.any(Object)));
  expect(await screen.findAllByText((_, element) => element?.textContent === "2 / 2")).not.toHaveLength(0);
});

it('refreshes after an admin mutation event without a hard reload', async () => {
  render(<Page />); await screen.findByRole('heading', { name: 'Live Contest' });
  fireEvent(window, new Event('codeskill-contests-changed'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
});
