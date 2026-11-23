import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import GlobalLockdownDock from "@/components/assessment/GlobalLockdownDock";
import * as bridge from "@/lib/lockdown-bridge";
import { usePathname } from "next/navigation";

jest.mock("@/lib/lockdown-bridge", () => ({
  isLockdownClient: jest.fn(),
  getBatteryStatus: jest.fn().mockResolvedValue({ percentage: 100, is_charging: true, has_battery: true }),
  getSystemVolume: jest.fn().mockResolvedValue(50),
  setSystemVolume: jest.fn().mockResolvedValue(undefined),
  getKeyboardLayout: jest.fn().mockResolvedValue("EN-US"),
  getSyncedTimestampMs: jest.fn().mockResolvedValue(Date.now()),
  scanWifiNetworks: jest.fn().mockResolvedValue([]),
  connectWifiNetwork: jest.fn().mockResolvedValue(undefined),
  verifyQuitPassword: jest.fn().mockResolvedValue({ authorized: false }),
  releaseLockdownKiosk: jest.fn().mockResolvedValue(undefined),
  getLockdownDiagnosticLogs: jest.fn().mockResolvedValue([]),
  logoutAndExitLockdown: jest.fn().mockResolvedValue(undefined),
  exitLockdownApp: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

describe("GlobalLockdownDock Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders null when not in LockDown client", () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(false);
    (usePathname as jest.Mock).mockReturnValue("/assessments/exam-1/instructions");

    const { container } = render(<GlobalLockdownDock />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null on /assessments/[id]/take to avoid duplicate with in-exam dock", () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(true);
    (usePathname as jest.Mock).mockReturnValue("/assessments/exam-1/take");

    const { container } = render(<GlobalLockdownDock />);
    expect(container.firstChild).toBeNull();
  });

  it("renders floating dock on /lockdown-startup-permissions", () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(true);
    (usePathname as jest.Mock).mockReturnValue("/lockdown-startup-permissions");

    render(<GlobalLockdownDock />);
    expect(screen.getByLabelText("CodeSkill LockDown Security Utility Dock")).toBeInTheDocument();
  });

  it("renders floating dock on /assessments/[id] instructions page", () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(true);
    (usePathname as jest.Mock).mockReturnValue("/assessments/exam-1");

    render(<GlobalLockdownDock />);
    expect(screen.getByLabelText("CodeSkill LockDown Security Utility Dock")).toBeInTheDocument();
  });
});
