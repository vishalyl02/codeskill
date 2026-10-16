import { act, renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { useAntiCheatMaster } from "@/hooks/anti-cheat/useAntiCheatMaster";
import api from "@/config/api";
import { io } from "socket.io-client";
jest.mock("@/config/api", () => ({ __esModule: true, default: { post: jest.fn().mockResolvedValue({ data: { success: true } }) } }));
jest.mock("socket.io-client", () => {
  const mockIo = jest.fn(() => ({ on: jest.fn(), emit: jest.fn(), disconnect: jest.fn() }));
  return { io: mockIo };
});
const config = { enableFullscreen: false, enableCopyProtect: false, enablePasteProtect: false, enableDevToolsDetect: false, enableTabSwitchDetect: false, warningLimit: 2 };
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});
it("records only active proctoring violations with the persisted session and stops listeners after completion", async () => {
  const finish = jest.fn();
  const { result, rerender } = renderHook(({ enabled }) => useAntiCheatMaster("contest", "student", "session", config, finish, enabled), { initialProps: { enabled: true } });
  await act(async () => fireEvent.keyDown(window, { key: "F12" }));
  expect(api.post).toHaveBeenCalledWith("/contests/contest/violations", { sessionId: "session", type: "Keyboard_DevTools", metadata: {} });
  expect(result.current.warnings).toBe(1); expect(finish).not.toHaveBeenCalled();
  await act(async () => fireEvent.keyDown(window, { key: "F12" })); expect(finish).toHaveBeenCalledTimes(1);
  rerender({ enabled: false }); await act(async () => fireEvent.keyDown(window, { key: "F12" }));
  expect(api.post).toHaveBeenCalledTimes(2);
});
it("retains warnings without forcing submission when the contest configuration disables it", async () => {
  const finish = jest.fn();
  renderHook(() => useAntiCheatMaster("contest", "student", "session", { ...config, warningLimit: 1, autoSubmitOnViolation: false }, finish));
  await act(async () => fireEvent.keyDown(window, { key: "F12" })); expect(finish).not.toHaveBeenCalled();
});
it("reads the current auth token when the WebSocket connects (AUD-007)", () => {
  localStorage.setItem("codeskill_token", "jwt-secret-session-token");
  const finish = jest.fn();
  renderHook(() => useAntiCheatMaster("contest", "student", "session", config, finish, true));
  expect(io).toHaveBeenCalledTimes(1);
  const options = jest.mocked(io).mock.calls[0][1] as {
    auth: (callback: (credentials: { token?: string }) => void) => void;
  };
  const callback = jest.fn();
  options.auth(callback);
  expect(callback).toHaveBeenCalledWith({ token: "Bearer jwt-secret-session-token" });
});
