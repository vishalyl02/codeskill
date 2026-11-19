export type AssessmentFaceReference = {
  embedding: number[];
  capturedAt: number;
};

export type AssessmentFaceCheck =
  | { status: "match"; similarity: number; yaw?: number }
  | { status: "mismatch"; similarity: number; yaw?: number }
  | { status: "no-face" | "multiple-faces" };

const HUMAN_MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/";
const MATCH_THRESHOLD = 0.55;
const references = new Map<string, AssessmentFaceReference>();
let humanPromise: Promise<any> | null = null;
let faceLandmarkerPromise: Promise<any> | null = null;

async function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = import("@mediapipe/tasks-vision").then(async ({ FilesetResolver, FaceLandmarker }) => {
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      } catch {
        vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm");
      }
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/mediapipe/models/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numFaces: 3,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    }).catch((error) => {
      faceLandmarkerPromise = null;
      throw error;
    });
  }
  return faceLandmarkerPromise;
}

async function countFaces(snapshot: HTMLCanvasElement) {
  const landmarker = await getFaceLandmarker();
  // The MediaPipe CPU wasm runtime reports XNNPACK initialization as an
  // error-level console message in some browsers. Next's dev overlay treats
  // it as a fatal client error, so filter only this known informational log
  // during the synchronous inference call.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === "string" && arg.includes("Created TensorFlow Lite XNNPACK delegate for CPU."))) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
  let result;
  try {
    result = landmarker.detect(snapshot);
  } finally {
    console.error = originalConsoleError;
  }
  return (result.faceLandmarks || []).length as number;
}

async function getHuman() {
  if (!humanPromise) {
    // Human supplies face embeddings for identity matching; MediaPipe detection
    // alone cannot establish whether two faces belong to the same person.
    // Import the ESM browser bundle explicitly: the package's default Node
    // entry depends on @tensorflow/tfjs-node, which is not a browser runtime.
    humanPromise = import("@vladmandic/human").then(async (humanModule) => {
      const Human = (humanModule as unknown as { default: new (config: any) => any }).default;
      const human = new Human({
        modelBasePath: HUMAN_MODELS,
        face: {
          enabled: true,
          detector: { maxDetected: 3, minConfidence: 0.6 },
          mesh: { enabled: true },
          attention: { enabled: false },
          iris: { enabled: false },
          description: { enabled: true },
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
          gear: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false },
      });
      await human.load();
      return human;
    }).catch((error) => {
      humanPromise = null;
      throw error;
    });
  }
  return humanPromise;
}

export async function createAssessmentFaceReference(
  snapshot: HTMLCanvasElement,
): Promise<AssessmentFaceReference> {
  const faceCount = await countFaces(snapshot);
  if (faceCount === 0) throw new Error("We could not detect a clear face. Center your face in the camera and try again.");
  if (faceCount > 1) throw new Error("More than one face is visible. Make sure only you are in the camera view.");

  const human = await getHuman();
  const result = await human.detect(snapshot);
  const faces = result.face || [];
  if (faces.length === 0 || !faces[0]?.embedding) {
    throw new Error("We could not detect a clear face. Center your face in the camera and try again.");
  }
  if (faces.length > 1) {
    throw new Error("More than one face is visible. Make sure only you are in the camera view.");
  }
  return { embedding: [...faces[0].embedding], capturedAt: Date.now() };
}

export function setAssessmentFaceReference(assessmentId: string, reference: AssessmentFaceReference) {
  references.set(assessmentId, reference);
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(`codeskill_face_ref_${assessmentId}`, JSON.stringify(reference));
    }
  } catch {
    // Ignore storage errors
  }
}

export function getAssessmentFaceReference(assessmentId: string): AssessmentFaceReference | null {
  const mem = references.get(assessmentId);
  if (mem) return mem;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(`codeskill_face_ref_${assessmentId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as AssessmentFaceReference;
        references.set(assessmentId, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export async function disposeFaceLandmarker(): Promise<void> {
  if (faceLandmarkerPromise) {
    try {
      const landmarker = await faceLandmarkerPromise;
      if (typeof landmarker?.close === "function") {
        landmarker.close();
      }
    } catch {
      // Ignore cleanup error
    } finally {
      faceLandmarkerPromise = null;
    }
  }
}

export function clearAssessmentFaceReference(assessmentId: string) {
  references.delete(assessmentId);
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(`codeskill_face_ref_${assessmentId}`);
    }
  } catch {
    // Ignore storage errors
  }
  if (references.size === 0) {
    void disposeFaceLandmarker();
  }
}

/** Detects face count and compares the live face embedding with the pre-exam selfie. */
export async function checkAssessmentFace(
  snapshot: HTMLCanvasElement,
  reference: AssessmentFaceReference,
): Promise<AssessmentFaceCheck> {
  const faceCount = await countFaces(snapshot);
  if (faceCount === 0) return { status: "no-face" };
  if (faceCount > 1) return { status: "multiple-faces" };

  const human = await getHuman();
  const result = await human.detect(snapshot);
  const faces = result.face || [];
  if (faces.length === 0 || !faces[0]?.embedding) return { status: "no-face" };
  if (faces.length > 1) return { status: "multiple-faces" };

  const face = faces[0];
  const similarity = human.match.similarity(face.embedding, reference.embedding);
  const yaw = Number.isFinite(face.rotation?.angle?.yaw) ? face.rotation.angle.yaw : undefined;
  return {
    status: similarity >= MATCH_THRESHOLD ? "match" : "mismatch",
    similarity,
    yaw,
  };
}
