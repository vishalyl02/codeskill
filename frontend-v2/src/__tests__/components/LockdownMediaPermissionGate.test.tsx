import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import LockdownMediaPermissionGate from "@/components/assessment/LockdownMediaPermissionGate";
import { getPreferredAssessmentCamera, releaseAssessmentStream, takeAssessmentStream } from "@/lib/assessment-media-session";

jest.mock("@/lib/lockdown-bridge", () => ({
  checkAndRequestMediaPermissions: jest.fn().mockResolvedValue({ camera: "granted", microphone: "granted" }),
  inspectMediaHardware: jest.fn().mockResolvedValue({ passed: true, virtualDevicesDetected: [] }),
  savePersistedExamSession: jest.fn().mockResolvedValue(undefined),
  isLockdownClient: () => true,
}));

const webcam = { kind: "videoinput", deviceId: "webcam", label: "Built-in Webcam" };
const phone = { kind: "videoinput", deviceId: "phone", label: "Student's iPhone Camera" };
const getUserMedia = jest.fn();
const enumerateDevices = jest.fn();

function cameraStream(device: typeof webcam) {
  const track = {
    label: device.label,
    readyState: "live",
    getSettings: () => ({ deviceId: device.deviceId }),
    stop: jest.fn(),
  };
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}

beforeEach(() => {
  sessionStorage.clear();
  getUserMedia.mockReset();
  enumerateDevices.mockReset().mockResolvedValue([webcam, phone]);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  releaseAssessmentStream("exam");
  jest.restoreAllMocks();
});

it("blocks a known phone default before capture and leaves the camera picker hidden", async () => {
  enumerateDevices.mockResolvedValue([phone, webcam]);
  const onReady = jest.fn();
  jest.spyOn(console, "error").mockImplementation(() => {});
  render(<LockdownMediaPermissionGate assessmentId="exam" requireMic={false} cameraSelectionPolicy="system_default" onReady={onReady} />);

  expect(await screen.findByText(/Disconnect the phone camera/)).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Choose camera" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm Media Setup & Enter" })).toBeDisabled();
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
});

it("previews an allowed phone input and preserves that choice for the assessment", async () => {
  const original = cameraStream(webcam);
  const selected = cameraStream(phone);
  getUserMedia.mockResolvedValueOnce(original.stream).mockResolvedValueOnce(selected.stream);
  const onReady = jest.fn();
  const { container } = render(
    <LockdownMediaPermissionGate assessmentId="exam" requireMic={false} cameraSelectionPolicy="student_select" onReady={onReady} />,
  );
  const picker = await screen.findByRole("combobox", { name: "Choose camera" });
  await waitFor(() => expect(picker).toBeEnabled());
  fireEvent.change(picker, { target: { value: "phone" } });
  const confirm = screen.getByRole("button", { name: "Confirm Media Setup & Enter" });
  await waitFor(() => expect(confirm).toBeEnabled());

  expect(getUserMedia).toHaveBeenLastCalledWith({
    video: expect.objectContaining({ deviceId: { exact: "phone" } }),
    audio: false,
  });
  expect(container.querySelector("video")?.srcObject).toBe(selected.stream);
  expect(original.track.stop).toHaveBeenCalledTimes(1);
  fireEvent.click(confirm);
  expect(getPreferredAssessmentCamera("exam")).toBe("phone");
  expect(selected.track.stop).not.toHaveBeenCalled();
  expect(takeAssessmentStream("exam", "phone", "student_select")).toBe(selected.stream);
  selected.track.stop();
  expect(onReady).toHaveBeenCalledTimes(1);
});
