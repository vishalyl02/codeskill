import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
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

    expect(screen.getByRole("heading", { name: "CodeSkill LockDown required" })).toBeInTheDocument();
    expect(screen.getByText("Assessment: Computer Systems Midterm")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    });
  });

  it("shows first-time install steps for each operating system", async () => {
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" />);
    });

    expect(screen.getByRole("heading", { name: "First-time setup: How to open without security certificate warnings" })).toBeInTheDocument();
    expect(screen.getByText(/Drag CodeSkill LockDown into Applications/)).toBeInTheDocument();
    const macSteps = within(screen.getByRole("list", { name: /If macOS Gatekeeper shows/ })).getAllByRole("listitem");
    expect(macSteps[1]).toHaveTextContent('xattr -cr /Applications/"CodeSkill LockDown.app"');
    expect(macSteps[2]).toHaveTextContent("Finder");

    fireEvent.click(screen.getByRole("button", { name: "Windows" }));
    expect(screen.getByRole("button", { name: "Windows" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Open the downloaded .exe file/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download for Windows" })).toBeInTheDocument();
    const windowsSteps = within(screen.getByRole("list", { name: /If Microsoft Defender SmartScreen displays/ })).getAllByRole("listitem");
    expect(windowsSteps[1]).toHaveTextContent("Run anyway");
    expect(windowsSteps[2]).toHaveTextContent(String.raw`Unblock-File -Path .\CodeSkill-LockDown-Setup.exe`);
    expect(windowsSteps[2]).toHaveTextContent(String.raw`.\CodeSkill-LockDown-Setup.exe`);
    expect(screen.queryByText(/xattr -cr/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Linux" }));
    expect(screen.getByText(/Open the .deb file/)).toBeInTheDocument();
    expect(screen.getByText(/choose an X11 session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download for Linux" })).toBeInTheDocument();
    const linuxSteps = within(screen.getByRole("list", { name: "Install and grant permissions on Ubuntu / Debian:" })).getAllByRole("listitem");
    expect(linuxSteps[0]).toHaveTextContent("sudo dpkg -i codeskill-lockdown.deb || sudo apt-get install -f -y");
    expect(linuxSteps[1]).toHaveTextContent("chmod +x codeskill-lockdown.AppImage && ./codeskill-lockdown.AppImage");
  });

  it("requests the selected installers and gives download feedback", async () => {
    const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await act(async () => {
        render(<LockdownLaunchGate examId="exam-123" />);
      });

      fireEvent.click(screen.getByRole("button", { name: "Download for macOS" }));
      expect(screen.getByRole("status")).toHaveTextContent("Requesting the macOS download");
      expect(anchorClick.mock.contexts[0]).toHaveAttribute("href", "/api/lockdown/download?platform=macos&version=1.0.0");

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Check your browser’s downloads");
      }, { timeout: 3000 });

      fireEvent.click(screen.getByRole("button", { name: "Linux" }));
      fireEvent.click(screen.getByRole("button", { name: ".AppImage (Portable)" }));
      expect(screen.getByText(/Find the downloaded .AppImage file/)).toBeInTheDocument();
      expect(screen.getByText("chmod +x codeskill-lockdown.AppImage && ./codeskill-lockdown.AppImage")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Download for Linux" }));
      expect(anchorClick.mock.contexts[1]).toHaveAttribute("href", "/api/lockdown/download?platform=linux&version=1.0.0&format=appimage");

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Linux installer");
      }, { timeout: 3000 });
    } finally {
      anchorClick.mockRestore();
    }
  });

  it("copies the complete command block to the clipboard", async () => {
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      await act(async () => {
        render(<LockdownLaunchGate examId="exam-123" />);
      });
      fireEvent.click(screen.getByRole("button", { name: "Copy command for step 2" }));

      expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith('xattr -cr /Applications/"CodeSkill LockDown.app"');
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("detects the LockDown client automatically and offers system diagnostics", async () => {
    const onClientDetected = jest.fn();
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(true);
    await act(async () => {
      render(<LockdownLaunchGate examId="exam-123" onClientDetected={onClientDetected} />);
    });

    expect(onClientDetected).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Run system check" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^codeskill-lockdown:\/\/system-check/),
    );
    expect(screen.queryByRole("button", { name: "Check LockDown status" })).not.toBeInTheDocument();
  });
});
