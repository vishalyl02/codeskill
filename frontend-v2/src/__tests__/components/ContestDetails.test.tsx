import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  expect(screen.getByRole("link", { name: "Sign in to register" })).toHaveAttribute("href", "/login");
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

it("passes a private contest password and permits retry after registration failure", async () => {
  auth.mockReturnValue({ user, loading: false } as ReturnType<typeof useAuth>);
  get.mockResolvedValueOnce({ data: { ...contest, isPrivate: true } });
  post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { message: "Invalid contest password" } } });
  render(<ContestDetails />);
  fireEvent.change(await screen.findByLabelText("Contest password"), { target: { value: "incorrect" } });
  fireEvent.click(screen.getByRole("button", { name: "Register for contest" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid contest password");
  fireEvent.change(screen.getByLabelText("Contest password"), { target: { value: "correct" } });
  fireEvent.click(screen.getByRole("button", { name: "Register for contest" }));
  await waitFor(() => expect(post).toHaveBeenLastCalledWith("/contests/contest-database-id/register", { password: "correct" }, expect.objectContaining({ signal: expect.any(AbortSignal) })));
  expect(await screen.findByRole("status")).toHaveTextContent("You are registered");
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
