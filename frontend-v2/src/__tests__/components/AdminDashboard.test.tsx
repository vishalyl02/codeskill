import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import gsap from "gsap";
import AdminDashboard from "@/app/admin/dashboard/page";
import { adminDashboardAPI, adminLearningAPI } from "@/config/api";

jest.mock("@/config/api", () => ({
  adminDashboardAPI: { getStats: jest.fn() },
  adminLearningAPI: {
    getOverview: jest.fn().mockResolvedValue({
      data: { success: true, data: { totalCertificates: 12, totalPaths: 4 } },
    }),
  },
}));

const getStats = jest.mocked(adminDashboardAPI.getStats);
const getOverview = jest.mocked(adminLearningAPI.getOverview);
const data = { data: { success: true, stats: { totalUsers: 27, activeToday: 0 }, recentActivity: { users: [] } } };
let reducedMotion = false;
const removeListener = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  reducedMotion = false;
  getStats.mockResolvedValue(data as Awaited<ReturnType<typeof adminDashboardAPI.getStats>>);
  getOverview.mockResolvedValue({
    data: { success: true, data: { totalCertificates: 12, totalPaths: 4 } },
  } as Awaited<ReturnType<typeof adminLearningAPI.getOverview>>);
  window.matchMedia = jest.fn((query: string) => ({
    matches: query.includes("no-preference") ? !reducedMotion : reducedMotion,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: removeListener,
    dispatchEvent: jest.fn(),
  }));
});

function finishAnimations() {
  act(() => {
    gsap.globalTimeline.getChildren(false).forEach((animation) => animation.totalProgress(1));
  });
}

function expectContentVisible(container: HTMLElement) {
  const cards = container.querySelectorAll<HTMLElement>(".stat-card, .action-tile, .activity-section");
  expect(cards).toHaveLength(13);
  cards.forEach((card) => {
    expect(card).toBeVisible();
    expect(card.style.opacity).toBe("");
    expect(card.style.transform).toBe("");
  });
}

it("keeps all dashboard cards visible after effect replay, data loading, and refresh", async () => {
  const { container } = render(<React.StrictMode><AdminDashboard /></React.StrictMode>);
  await waitFor(() => expect(screen.getByText("27")).toBeInTheDocument());
  finishAnimations();
  expectContentVisible(container);
  expect(screen.getByRole("link", { name: /Active Today/ })).toHaveTextContent("0");
  fireEvent.click(screen.getByRole("button", { name: "Sync Telemetry" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Sync Telemetry" })).toBeEnabled());
  expect(getStats).toHaveBeenCalledTimes(3); // Strict Mode mounts twice, then refreshes.
  expectContentVisible(container);
});

it("renders visible content without animations for reduced motion", async () => {
  reducedMotion = true;
  const { container } = render(<AdminDashboard />);
  await waitFor(() => expect(screen.getByText("27")).toBeInTheDocument());
  expectContentVisible(container);
});

it("cleans up animation styles and the media context when unmounted mid-animation", () => {
  const matchMedia = jest.spyOn(gsap, "matchMedia");
  const { container, unmount } = render(<AdminDashboard />);
  const mediaContext = matchMedia.mock.results[0].value;
  const revert = jest.spyOn(mediaContext, "revert");
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".stat-card, .action-tile"));
  unmount();
  cards.forEach((card) => {
    expect(card.style.opacity).toBe("");
    expect(card.style.transform).toBe("");
  });
  expect(revert).toHaveBeenCalled();
  matchMedia.mockRestore();
});

it("still displays operations and safe empty data when the API fails", async () => {
  getStats.mockRejectedValueOnce(new Error("Unavailable"));
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { container } = render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText("No recent candidates found in system records.")).toBeInTheDocument());
    finishAnimations();
    expectContentVisible(container);
    expect(screen.getByRole("link", { name: "Add Question" })).toHaveAttribute("href", "/admin/questions/create");
  } finally {
    error.mockRestore();
  }
});

it("safely handles empty responses and renders fallback values gracefully", async () => {
  getStats.mockResolvedValueOnce({
    data: { success: true, stats: { totalUsers: 0, activeToday: 0 } },
  } as Awaited<ReturnType<typeof adminDashboardAPI.getStats>>);
  getOverview.mockResolvedValueOnce({
    data: { success: true, data: { totalCertificates: 0, totalPaths: 0 } },
  } as Awaited<ReturnType<typeof adminLearningAPI.getOverview>>);

  const { container } = render(<AdminDashboard />);
  await waitFor(() => expect(screen.getByRole("heading", { name: /Dashboard/ })).toBeInTheDocument());
  finishAnimations();
  expectContentVisible(container);
});
