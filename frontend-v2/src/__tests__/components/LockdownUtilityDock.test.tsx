import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LockdownUtilityDock from "@/components/assessment/LockdownUtilityDock";
import * as lockdownBridge from "@/lib/lockdown-bridge";

jest.mock("@/lib/lockdown-bridge", () => ({
  getBatteryStatus: jest.fn().mockResolvedValue({
    percentage: 100,
    is_charging: true,
    has_battery: false,
  }),
  getSystemVolume: jest.fn().mockResolvedValue(65),
  setSystemVolume: jest.fn().mockResolvedValue(undefined),
  getKeyboardLayout: jest.fn().mockResolvedValue("EN-US"),
  getSyncedTimestampMs: jest.fn().mockResolvedValue(1700000000000),
  scanWifiNetworks: jest.fn().mockResolvedValue([
    { ssid: "Campus-Secure", signal_strength: 95, is_connected: true, is_secured: true },
    { ssid: "Student-Hotspot", signal_strength: 75, is_connected: false, is_secured: true },
  ]),
  connectWifiNetwork: jest.fn().mockResolvedValue(undefined),
  verifyQuitPassword: jest.fn().mockResolvedValue({ authorized: true }),
  releaseLockdownKiosk: jest.fn().mockResolvedValue(undefined),
}));

describe("LockdownUtilityDock Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders collapsed by default with LockDown badge, grip handle, and expand button", async () => {
    render(<LockdownUtilityDock assessmentId="test-exam-123" />);

    expect(screen.getByLabelText("CodeSkill LockDown Security Utility Dock")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag utility dock")).toBeInTheDocument();
    expect(screen.getByText("LockDown")).toBeInTheDocument();
    expect(screen.getByTitle("Expand utility dock controls")).toBeInTheDocument();
    // AC Power should be displayed when has_battery is false
    expect(await screen.findByText("AC Power")).toBeInTheDocument();
  });

  it("expands controls when expand button is clicked", async () => {
    render(
      <LockdownUtilityDock
        assessmentId="test-exam-123"
        allowCalculators={true}
        referencePdfUrl="https://example.com/ref.pdf"
      />
    );

    const expandBtn = screen.getByTitle("Expand utility dock controls");
    fireEvent.click(expandBtn);

    // After expansion, toolbar controls should be visible
    expect(screen.getByTitle("In-App Scientific Calculator")).toBeInTheDocument();
    expect(screen.getByTitle("In-App Rough Scratchpad")).toBeInTheDocument();
    expect(screen.getByTitle("Approved Reference Material")).toBeInTheDocument();
    expect(screen.getByTitle("Safe Reload: Flushes offline queue first, then reloads webview")).toBeInTheDocument();
    expect(screen.getByTitle("Collapse utility dock")).toBeInTheDocument();
    expect(screen.getByTitle("Proctor Quit: Exit LockDown Kiosk")).toBeInTheDocument();
  });

  it("collapses when clicking the collapse button", async () => {
    render(<LockdownUtilityDock assessmentId="test-exam-123" />);

    // Expand
    fireEvent.click(screen.getByTitle("Expand utility dock controls"));
    expect(screen.getByTitle("Collapse utility dock")).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByTitle("Collapse utility dock"));
    expect(screen.getByTitle("Expand utility dock controls")).toBeInTheDocument();
  });

  it("opens the scientific calculator modal and evaluates calculation", async () => {
    render(<LockdownUtilityDock assessmentId="test-exam-123" allowCalculators={true} />);

    // Expand dock and click calculator
    fireEvent.click(screen.getByTitle("Expand utility dock controls"));
    fireEvent.click(screen.getByTitle("In-App Scientific Calculator"));

    expect(screen.getByText("Scientific Calculator")).toBeInTheDocument();

    // Click 7, +, 5, =
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "=" }));

    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("opens the scratchpad modal and saves input", async () => {
    render(<LockdownUtilityDock assessmentId="test-exam-123" />);

    // Expand dock and click scratchpad
    fireEvent.click(screen.getByTitle("Expand utility dock controls"));
    fireEvent.click(screen.getByTitle("In-App Rough Scratchpad"));

    expect(screen.getByText("Exam Rough Scratchpad")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(
      "Use this scratchpad for notes, code snippets, calculations, or logic planning..."
    );
    fireEvent.change(textarea, { target: { value: "My rough working: O(N log N)" } });

    expect(textarea).toHaveValue("My rough working: O(N log N)");
    expect(screen.getByText(/characters/)).toBeInTheDocument();
  });

  it("opens the Wi-Fi scanner modal and shows networks with manual connection option", async () => {
    render(<LockdownUtilityDock assessmentId="test-exam-123" />);

    // Wi-Fi button is visible on both collapsed and expanded states
    const wifiBtn = screen.getByTitle("Wi-Fi Connection & In-Dock Reconnect");
    fireEvent.click(wifiBtn);

    expect(await screen.findByText("Wi-Fi Connection")).toBeInTheDocument();
    expect(await screen.findByText("Nearby Networks")).toBeInTheDocument();
    expect(await screen.findByText("Connect to Network or Mobile Hotspot:")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Campus-Secure")).toBeInTheDocument();
      expect(screen.getByText("Student-Hotspot")).toBeInTheDocument();
    });
  });
});
