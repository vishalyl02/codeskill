type AssessmentMediaRegistry = {
  pending: { assessmentId: string; stream: MediaStream } | null;
  streams: Map<string, Set<MediaStream>>;
};

function getRegistry(): AssessmentMediaRegistry {
  const scope = globalThis as typeof globalThis & {
    __codeskillAssessmentMediaRegistry__?: AssessmentMediaRegistry;
  };
  if (!scope.__codeskillAssessmentMediaRegistry__) {
    scope.__codeskillAssessmentMediaRegistry__ = { pending: null, streams: new Map() };
  }
  return scope.__codeskillAssessmentMediaRegistry__;
}

function rememberAssessmentStream(assessmentId: string, stream: MediaStream) {
  const registry = getRegistry();
  const streams = registry.streams.get(assessmentId) || new Set<MediaStream>();
  streams.add(stream);
  registry.streams.set(assessmentId, streams);
}

export function trackAssessmentStream(assessmentId: string, stream: MediaStream) {
  rememberAssessmentStream(assessmentId, stream);
}

export function handoffAssessmentStream(assessmentId: string, stream: MediaStream) {
  const registry = getRegistry();
  if (registry.pending?.stream !== stream) {
    registry.pending?.stream.getTracks().forEach((track) => track.stop());
  }
  registry.pending = { assessmentId, stream };
  rememberAssessmentStream(assessmentId, stream);
}

export function takeAssessmentStream(assessmentId: string, deviceId?: string) {
  const registry = getRegistry();
  if (registry.pending?.assessmentId !== assessmentId) return null;

  const pending = registry.pending;
  registry.pending = null;
  const currentDeviceId = pending.stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (deviceId && currentDeviceId && currentDeviceId !== deviceId) {
    pending.stream.getTracks().forEach((track) => track.stop());
    return null;
  }
  return pending.stream;
}

export function releaseAssessmentStream(assessmentId: string) {
  const registry = getRegistry();
  const streams = registry.streams.get(assessmentId);
  if (streams) {
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    registry.streams.delete(assessmentId);
  }
  if (registry.pending?.assessmentId === assessmentId) {
    registry.pending.stream.getTracks().forEach((track) => track.stop());
    registry.pending = null;
  }
}

export function setPreferredAssessmentCamera(assessmentId: string, deviceId: string) {
  try {
    sessionStorage.setItem(`assessment-camera:${assessmentId}`, deviceId);
  } catch {
    // Camera selection is an in-session preference; storage may be unavailable.
  }
}

export function getPreferredAssessmentCamera(assessmentId: string) {
  try {
    return sessionStorage.getItem(`assessment-camera:${assessmentId}`) || undefined;
  } catch {
    return undefined;
  }
}
