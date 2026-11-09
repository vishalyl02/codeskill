import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/config/api";
import ContestDetails from "@/app/contests/[id]/page";

jest.mock("next/navigation", () => ({ useParams: jest.fn() }));
jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/config/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const get = jest.mocked(api.get);
const post = jest.mocked(api.post);
const auth = jest.mocked(useAuth);
const params = jest.mocked(useParams);
const user = { id: "user-id", _id: "user-id", name: "Candidate", email: "candidate@example.com", role: "student" };
const contest = {
  id: "contest-database-id", title: "Contest", description: "Contest description", problems: ["one", "two"],
  startTime: new Date(Date.now() - 60000).toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(),
  isPrivate: false, participants: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  params.mockReturnValue({ id: "contest" });
  auth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
  get.mockResolvedValue({ data: contest });
  post.mockResolvedValue({ data: { success: true } });
});

it("loads the reported public slug and shows the actual contest details", async () => {
  render(<ContestDetails />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading contest");
  expect(await screen.findByRole("heading", { name: "Contest", exact: true })).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith("/contests/contest", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getAllByText("Contest description").length).toBeGreaterThan(0);
  expect(screen.getByText("Live", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute("href", "/login");
});

it("handles a missing or unpublished contest without a framework 404", async () => {
  get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
  render(<ContestDetails />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Contest not found");
  expect(screen.queryByRole("button", { name: "Register for contest" })).toBeNull();
});

it("allows retry after a failed load", async () => {
  get.mockRejectedValueOnce(new Error("Network error"));
  render(<ContestDetails />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Contest", exact: true })).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

it("registers with the database ID and immediately shows the registered state", async () => {
  auth.mockReturnValue({ user, loading: false } as ReturnType<typeof useAuth>);
  render(<ContestDetails />);
  fireEvent.click(await screen.findByRole("button", { name: "Register for contest" }));
  expect(post).toHaveBeenCalledWith("/contests/contest-database-id/register", {}, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(await screen.findByRole("status")).toHaveTextContent("You are registered");
  expect(screen.queryByRole("button", { name: "Register for contest" })).toBeNull();
});

it("routes a private contest through the secure start gate without registering on the detail page", async () => {
  auth.mockReturnValue({ user, loading: false } as ReturnType<typeof useAuth>);
  get.mockResolvedValueOnce({ data: { ...contest, isPrivate: true } });
  render(<ContestDetails />);
  const startLink = await screen.findByRole("link", { name: "Continue to secure start" });
  expect(startLink).toHaveAttribute("href", "/contests/contest-database-id/attempt");
  expect(screen.queryByLabelText("Contest password")).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

it.each(["ended", "registered"])("does not offer duplicate or closed registration when %s", async (state) => {
  auth.mockReturnValue({ user, loading: false } as ReturnType<typeof useAuth>);
  get.mockResolvedValueOnce({ data: { ...contest, ...(state === "ended" ? { endTime: new Date(Date.now() - 1000).toISOString() } : { participants: [user.id] }) } });
  render(<ContestDetails />);
  await screen.findByRole("heading", { name: "Contest", exact: true });
  expect(screen.queryByRole("button", { name: "Register for contest" })).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

it("cancels a pending fetch on unmount", () => {
  get.mockImplementationOnce(() => new Promise(() => {}));
  const { unmount } = render(<ContestDetails />);
  const signal = get.mock.calls[0][1]?.signal as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
});
