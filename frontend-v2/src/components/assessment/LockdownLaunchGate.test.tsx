import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LockdownLaunchGate from "./LockdownLaunchGate";
import * as bridge from "@/lib/lockdown-bridge";

jest.mock("@/lib/lockdown-bridge", () => ({
  isLockdownClient: jest.fn(),
}));

jest.mock("@/lib/auth-storage", () => ({
  authStorage: {
    getAccessToken: jest.fn(() => "mock-jwt-token"),
  },
}));

describe("LockdownLaunchGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(false);
    // Mock global fetch for version tag manifest
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, version: "1.0.0", tag: "lockdown-v1.0.0" }),
      })
    ) as jest.Mock;
  });

  it("renders gate heading, exam title, and version tag badge", async () => {
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" examTitle="Computer Systems Midterm" />);
    });

    expect(screen.getByText("CodeSkill LockDown Required")).toBeInTheDocument();
    expect(screen.getByText("Assessment: Computer Systems Midterm")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("v1.0.0 (Latest Release)")).toBeInTheDocument();
    });
  });

  it("renders download buttons for Windows, macOS, and Linux with format labels", async () => {
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" />);
    });

    expect(screen.getByText("Windows")).toBeInTheDocument();
    expect(screen.getByText(".exe Installer (NSIS)")).toBeInTheDocument();

    expect(screen.getByText("macOS")).toBeInTheDocument();
    expect(screen.getByText(".dmg (Apple Silicon & Intel)")).toBeInTheDocument();

    expect(screen.getByText("Linux")).toBeInTheDocument();
  });

  it("triggers in-app background download when macOS button is clicked", async () => {
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" />);
    });

    const macButton = screen.getByText("macOS").closest("button");
    expect(macButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(macButton!);
    });

    // Should display in-app feedback banner
    await waitFor(() => {
      expect(
        screen.getByText(/Initiating v1.0.0 download for macos|Download started for MACOS/i)
      ).toBeInTheDocument();
    });
  });

  it("allows toggling Linux format between .deb and .AppImage", async () => {
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" />);
    });

    const appImageButton = screen.getByText(".AppImage (Portable)");
    await act(async () => {
      fireEvent.click(appImageButton);
    });

    expect(screen.getByText(".appimage (Ubuntu / Fedora)")).toBeInTheDocument();

    const debButton = screen.getByText(".deb (Debian/Ubuntu)");
    await act(async () => {
      fireEvent.click(debButton);
    });

    expect(screen.getByText(".deb (Ubuntu / Fedora)")).toBeInTheDocument();
  });

  it("toggles first-time setup instructions and platform tabs", async () => {
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" />);
    });

    const toggleButton = screen.getByText(/First-time setup: How to open without security certificate warnings/i);
    await act(async () => {
      fireEvent.click(toggleButton);
    });

    expect(screen.getByText(/If macOS Gatekeeper shows/i)).toBeInTheDocument();

    // Switch to Windows tab
    const tabs = screen.getAllByRole("button");
    const winTab = tabs.find((b) => b.textContent?.trim() === "Windows" && b.className.includes("rounded"));
    expect(winTab).toBeDefined();

    await act(async () => {
      fireEvent.click(winTab!);
    });
    expect(screen.getByText(/Microsoft Defender SmartScreen displays/i)).toBeInTheDocument();

    // Switch to Linux tab
    const linuxTab = tabs.find((b) => b.textContent?.trim() === "Linux" && b.className.includes("rounded"));
    expect(linuxTab).toBeDefined();

    await act(async () => {
      fireEvent.click(linuxTab!);
    });
    expect(screen.getByText(/Install and grant permissions on Ubuntu \/ Debian/i)).toBeInTheDocument();
  });
});
