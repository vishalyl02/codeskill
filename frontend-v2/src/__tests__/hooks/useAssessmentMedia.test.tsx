import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAssessmentMedia } from "@/hooks/useAssessmentMedia";
import { handoffAssessmentStream, setPreferredAssessmentCamera } from "@/lib/assessment-media-session";

function stream(deviceId = "webcam", label = "Built-in Webcam") {
  const video = { stop: jest.fn(), readyState: "live", label, getSettings: () => ({ deviceId }) };
  const audio = { stop: jest.fn(), readyState: "live" };
  const value = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  return { value, video, audio };
}
const getUserMedia = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it("keeps one active stream when the violation callback changes", async () => {
  const media = stream();
  getUserMedia.mockResolvedValue(media.value);
  const { result, rerender, unmount } = renderHook(({ callback }) => useAssessmentMedia("exam", true, callback), {
    initialProps: { callback: jest.fn() },
  });
  await waitFor(() => expect(result.current.cameraActive).toBe(true));
  rerender({ callback: jest.fn() });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(media.video.stop).not.toHaveBeenCalled();
  unmount();
  expect(media.video.stop).toHaveBeenCalledTimes(1);
  expect(media.audio.stop).toHaveBeenCalledTimes(1);
});

it("immediately stops all tracks, clears video and prevents initialization after repeated cleanup", async () => {
  const media = stream();
  getUserMedia.mockResolvedValue(media.value);
  const { result, rerender } = renderHook(({ enabled }) => useAssessmentMedia("exam", enabled, jest.fn()), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.cameraActive).toBe(true));
  const video = document.createElement("video");
  video.srcObject = media.value;
  result.current.videoRef.current = video;
  act(() => { result.current.stopCamera(); result.current.stopCamera(); });
  expect(media.video.stop).toHaveBeenCalledTimes(1);
  expect(media.audio.stop).toHaveBeenCalledTimes(1);
  expect(video.srcObject).toBeNull();
  expect(result.current.cameraActive).toBe(false);
  expect(result.current.micActive).toBe(false);
  rerender({ enabled: false });
  rerender({ enabled: true });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it.each(["submission", "unmount", "disabled", "pagehide"])("stops a late permission response after %s", async (reason) => {
  const media = stream();
  let resolve!: (value: MediaStream) => void;
  getUserMedia.mockImplementation(() => new Promise<MediaStream>(done => { resolve = done; }));
  const { result, rerender, unmount } = renderHook(({ enabled }) => useAssessmentMedia("exam", enabled, jest.fn()), { initialProps: { enabled: true } });
  act(() => {
    if (reason === "submission") result.current.stopCamera();
    if (reason === "unmount") unmount();
    if (reason === "disabled") rerender({ enabled: false });
    if (reason === "pagehide") window.dispatchEvent(new Event("pagehide"));
  });
  await act(async () => resolve(media.value));
  expect(media.video.stop).toHaveBeenCalledTimes(1);
  expect(media.audio.stop).toHaveBeenCalledTimes(1);
  expect(result.current.cameraActive).toBe(false);
});

it("does not request permissions until a live assessment is loaded", () => {
  renderHook(() => useAssessmentMedia("exam", false, jest.fn()));
  expect(getUserMedia).not.toHaveBeenCalled();
});

it("stops stale StrictMode streams and retains only the current stream", async () => {
  const first = stream(); const second = stream();
  getUserMedia.mockResolvedValueOnce(first.value).mockResolvedValueOnce(second.value);
  const { result, unmount } = renderHook(() => useAssessmentMedia("exam", true, jest.fn()), { wrapper: StrictMode });
  await waitFor(() => expect(result.current.cameraActive).toBe(true));
  expect(first.video.stop).toHaveBeenCalledTimes(1);
  expect(second.video.stop).not.toHaveBeenCalled();
  unmount();
  expect(second.video.stop).toHaveBeenCalledTimes(1);
  expect(second.audio.stop).toHaveBeenCalledTimes(1);
});

it("closes audio analysis and cancels animation on test completion", async () => {
  const media = stream();
  getUserMedia.mockResolvedValue(media.value);
  const disconnect = jest.fn(); const close = jest.fn().mockResolvedValue(undefined);
  const oldAudio = window.AudioContext;
  window.AudioContext = jest.fn(() => ({
    state: "running", close,
    createMediaStreamSource: () => ({ connect: jest.fn() }),
    createAnalyser: () => ({ frequencyBinCount: 2, getByteFrequencyData: jest.fn(), disconnect }),
  })) as unknown as typeof AudioContext;
  const frame = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  try {
    const { result } = renderHook(() => useAssessmentMedia("exam", true, jest.fn()));
    await waitFor(() => expect(result.current.cameraActive).toBe(true));
    act(() => result.current.stopCamera());
    expect(frame).toHaveBeenCalled(); expect(cancel).toHaveBeenCalledWith(42);
    expect(disconnect).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  } finally { window.AudioContext = oldAudio; }
});


it("uses the default webcam instead of a previously selected phone stream", async () => {
  const phone = stream("phone", "Student's iPhone Camera");
  const webcam = stream();
  setPreferredAssessmentCamera("exam", "phone");
  handoffAssessmentStream("exam", phone.value, "student_select");
  getUserMedia.mockResolvedValue(webcam.value);

  const { result } = renderHook(() => useAssessmentMedia("exam", true, jest.fn(), {
    cameraSelectionPolicy: "system_default",
    requireMicrophone: false,
  }));
  await waitFor(() => expect(result.current.mediaStream).toBe(webcam.value));
  expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
  expect(phone.video.stop).toHaveBeenCalledTimes(1);
  expect(result.current.micActive).toBe(false);
});

it("stops a phone webcam returned by the browser in default camera mode", async () => {
  const phone = stream("phone", "Student's iPhone Camera");
  getUserMedia.mockResolvedValue(phone.value);

  const { result } = renderHook(() => useAssessmentMedia("exam", true, jest.fn(), {
    cameraSelectionPolicy: "system_default",
  }));
  await waitFor(() => expect(result.current.cameraError).toContain("Disconnect the phone camera"));
  expect(result.current.mediaStream).toBeNull();
  expect(result.current.cameraActive).toBe(false);
  expect(phone.video.stop).toHaveBeenCalledTimes(1);
  expect(phone.audio.stop).toHaveBeenCalledTimes(1);
});

it("keeps the selected phone feed visible after reconnecting", async () => {
  const phone = stream("phone", "Student's iPhone Camera");
  const replacement = stream("phone", "Student's iPhone Camera");
  setPreferredAssessmentCamera("exam", "phone");
  handoffAssessmentStream("exam", phone.value, "student_select");
  getUserMedia.mockResolvedValue(replacement.value);

  const { result, unmount } = renderHook(() => useAssessmentMedia("exam", true, jest.fn()));
  const preview = document.createElement("video");
  act(() => result.current.attachVideo(preview));
  await waitFor(() => expect(preview.srcObject).toBe(phone.value));
  expect(getUserMedia).not.toHaveBeenCalled();

  await act(async () => result.current.reconnectMedia());
  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
    video: expect.objectContaining({ deviceId: { exact: "phone" } }),
  }));
  expect(result.current.mediaStream).toBe(replacement.value);
  expect(preview.srcObject).toBe(replacement.value);
  expect(phone.video.stop).toHaveBeenCalledTimes(1);
  expect(replacement.video.stop).not.toHaveBeenCalled();
  unmount();
  expect(replacement.video.stop).toHaveBeenCalledTimes(1);
});

it("disposes a replacement stream if the assessment ends during reconnect", async () => {
  const initial = stream();
  const replacement = stream();
  let resolve!: (value: MediaStream) => void;
  getUserMedia.mockResolvedValueOnce(initial.value)
    .mockImplementationOnce(() => new Promise<MediaStream>(done => { resolve = done; }));

  const { result } = renderHook(() => useAssessmentMedia("exam", true, jest.fn()));
  await waitFor(() => expect(result.current.mediaStream).toBe(initial.value));
  const reconnect = result.current.reconnectMedia();
  const rejected = expect(reconnect).rejects.toThrow("no longer active");
  act(() => result.current.stopCamera());
  await act(async () => {
    resolve(replacement.value);
    await rejected;
  });
  expect(result.current.mediaStream).toBeNull();
  expect(initial.video.stop).toHaveBeenCalledTimes(1);
  expect(replacement.video.stop).toHaveBeenCalledTimes(1);
});
