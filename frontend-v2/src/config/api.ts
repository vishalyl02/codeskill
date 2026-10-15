import { awaitExecution } from "@/lib/await-execution";
import axios from "axios";
import { getBrowserApiBaseURL } from "@/lib/api-base-url";
import { normalizeProblemQuery } from "@/lib/public-problems";
import { logger } from "@/lib/logger";

// Dynamically determine the correct API base URL
const getDynamicBaseURL = (): string => {
  if (typeof window !== "undefined") {
    return getBrowserApiBaseURL(process.env.NEXT_PUBLIC_API_URL, window.location);
  }
  return process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001/api";
};

const api = axios.create({
  baseURL: getDynamicBaseURL(),
});

// Attach JWT token to every request and ensure correct baseURL/URL formatting
api.interceptors.request.use((config) => {
  // Dynamically update baseURL in browser to prevent stale baked build URLs
  if (typeof window !== "undefined") {
    config.baseURL = getDynamicBaseURL();
  }

  // Normalize baseURL & url resolution
  if (config.baseURL && !config.baseURL.endsWith("/")) {
    config.baseURL += "/";
  }

  if (config.url && config.url.startsWith("/")) {
    config.url = config.url.substring(1);
  }

  // Prevent double "/api/api" if baseURL is /api/ and url starts with api/
  if (config.baseURL?.endsWith("/api/") && config.url?.startsWith("api/")) {
    config.url = config.url.substring(4);
  }

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("codeskill_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Helper to recursively normalize PostgreSQL `id` and MongoDB `_id`
function normalizeIds(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      normalizeIds(obj[i]);
    }
  } else {
    if (obj.id && !obj._id) {
      obj._id = obj.id;
    } else if (obj._id && !obj.id) {
      obj.id = obj._id;
    }
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === "object") {
        normalizeIds(obj[key]);
      }
    }
  }
  return obj;
}

// Handle responses and 401 errors globally without breaking login pages or public routes
api.interceptors.response.use(
  (res) => {
    if (res.data) {
      normalizeIds(res.data);
    }
    return res;
  },
  (error) => {
    const requestId =
      error.response?.headers?.["x-request-id"] ||
      error.config?.headers?.["x-request-id"] ||
      "unknown";
    const status = error.response?.status;
    const reqUrl = error.config?.url || "";

    if (status && status >= 400) {
      logger.warn(
        `API request failed: [${status}] ${reqUrl}`,
        {
          requestId,
          status,
          url: reqUrl,
          response: error.response?.data,
        },
        "APIClient"
      );
    }

    if (error.response?.status === 401 && typeof window !== "undefined") {
      const pathname = window.location.pathname;
      const isAuthPage =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/admin/login" ||
        pathname === "/student-login" ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/reset-password");

      const isAuthRequest =
        reqUrl.includes("auth/login") ||
        reqUrl.includes("auth/admin-login") ||
        reqUrl.includes("auth/student-login") ||
        reqUrl.includes("auth/register");

      // Only clear token and redirect if NOT on an auth page, NOT during an auth request, and NOT on public pages
      if (!isAuthPage && !isAuthRequest) {
        localStorage.removeItem("codeskill_token");
        const isPublicPage = pathname === "/" || pathname === "/problems" || pathname.startsWith("/problems/");
        if (!isPublicPage) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──
export const authAPI = {
  registerSendOTP: (data: { email: string }) => api.post("/auth/register/send-otp", data),
  register: (data: any) => api.post("/auth/register", data),
  login: (data: any) => api.post("/auth/login", data),
  adminLogin: (data: any) => api.post("/auth/admin-login", data),
  adminLoginVerify: (data: { email: string; otp: string }) => api.post("/auth/admin-login/verify", data),
  googleLogin: (token: string) => api.post("/auth/google", { token }),
  getMe: () => api.get("/auth/me"),
  updateProfile: (data: any) => api.put("/auth/profile", data),
  uploadAvatar: (formData: FormData) => api.post("/auth/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  }),
  saveNote: (problemId: string, note: string) => api.put(`/auth/notes/${problemId}`, { note }),
  toggleBookmark: (problemId: string) => api.put(`/auth/bookmark/${problemId}`),
  forgotPassword: (data: { email: string }) => api.post("/auth/forgot-password", data),
  resetPassword: (data: any) => api.post("/auth/reset-password", data),
  studentLogin: (data: { uid: string; password: string }) => api.post("/auth/student-login", data),
  forceChangePassword: (data: { currentPassword: string; newPassword: string }) => api.post("/auth/force-change-password", data),
};

export const usersAPI = {
  getPublicProfile: (identifier: string) => api.get(`/users/${identifier}`),
  getLeaderboard: (limit = 50) => api.get(`/users/leaderboard?limit=${limit}`),
};

// ── Public Problems ──
export const problemsAPI = {
  getAll: (page = 1, limit = 20, search = "", category = "All Topics", signal?: AbortSignal) => {
    const params: { page: number; limit: number; search?: string; category?: string } = { page, limit };
    const query = normalizeProblemQuery(search);
    const topic = normalizeProblemQuery(category, true);
    if (query) params.search = query;
    if (topic) params.category = topic;
    return api.get("/problems", { params, signal });
  },
  getBySlug: (slug: string) => api.get(`/problems/${slug}`),
};

export const petAPI = {
  ask: (data: {
    question: string;
    problemSlug?: string;
    code?: string;
    language?: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  }) => api.post<{ reply: string; source: "openrouter" | "deepseek" | "local"; notice?: string }>("/pet/ask", data, { timeout: 30000 }),
};

// ── Submissions ──
export const submissionAPI = {
  submit: (data: any) => 
    api.post("/submissions", data),
  getSubmissions: (problemId: number) => api.get(`/submissions/problem/${problemId}`),
};

export const runAPI = {
  runtimes: () => api.get<Array<{ language: string; version?: string; enabled: boolean }>>("/execution/runtimes"),
  run: (data: { code: string; language: string; testCases: any[]; config?: any }) =>
    api.post("/execution/run", data, { timeout: 60000 }),
  getJob: (jobId: string) => api.get(`/execution/jobs/${jobId}`, { timeout: 60000 }),
};

// Compatibility endpoint: backend selects the configured provider and queue.
export const azureRunAPI = {
  run: (data: {
    code: string;
    language: string;
    stdin?: string;
    testCases?: Array<{ id: string; input: string; expected: string }>;
    timeoutMs?: number;
    memoryMB?: number;
  }) => awaitExecution(
    () => api.post("/execution/azure-run", data, { timeout: 90000 }),
    jobId => runAPI.getJob(jobId),
  ),
};

// ── Discussions ──
export const discussionsAPI = {
  getThreads: (problemId: string, params?: { page?: number; sort?: string; tag?: string }) =>
    api.get(`/discussions/problem/${problemId}`, { params }),
  getThread: (threadId: string) => api.get(`/discussions/${threadId}`),
  createThread: (data: { problemId: string; title: string; body: string; tags?: string[] }) =>
    api.post("/discussions", data),
  deleteThread: (threadId: string) => api.delete(`/discussions/${threadId}`),
  voteThread: (threadId: string, direction: "up" | "down") =>
    api.put(`/discussions/${threadId}/vote`, { direction }),
  getReplies: (threadId: string) => api.get(`/discussions/${threadId}/replies`),
  createReply: (threadId: string, data: { body: string; parentReply?: string }) =>
    api.post(`/discussions/${threadId}/replies`, data),
  deleteReply: (replyId: string) => api.delete(`/discussions/replies/${replyId}`),
  voteReply: (replyId: string, direction: "up" | "down") =>
    api.put(`/discussions/replies/${replyId}/vote`, { direction }),
};

// ── Admin ──
export const adminProblemsAPI = {
  getAll: (params?: { page?: number; limit?: number; search?: string }, signal?: AbortSignal) =>
    api.get("/admin/problems", { params, signal }),
  getById: (id: string) => api.get(`/admin/problems/${id}`),
  create: (data: any) => api.post("/admin/problems", data),
  update: (id: string, data: any) => api.put(`/admin/problems/${id}`, data),
  delete: (id: string) => api.delete(`/admin/problems/${id}`),
};

function notifyContestChange<T>(response: T): T {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("codeskill-contests-changed"));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("codeskill-contests"); channel.postMessage("refresh"); channel.close();
    }
  }
  return response;
}

export const adminContestsAPI = {
  getAll: (page = 1, limit = 50, search = "") =>
    api.get(`/admin/contests?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`),
  getById: (id: string) => api.get(`/admin/contests/${id}`),
  create: (data: any) => api.post("/admin/contests", data).then(notifyContestChange),
  update: (id: string, data: any) => api.put(`/admin/contests/${id}`, data).then(notifyContestChange),
  delete: (id: string) => api.delete(`/admin/contests/${id}`).then(notifyContestChange),
  getResults: (id: string, params: any = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.status) q.set("status", params.status);
    if (params.minScore !== undefined && params.minScore !== "") q.set("minScore", String(params.minScore));
    if (params.maxScore !== undefined && params.maxScore !== "") q.set("maxScore", String(params.maxScore));
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return api.get(`/admin/contests/${id}/results${qs ? `?${qs}` : ""}`);
  },
  togglePublishResults: (id: string, publish?: boolean) =>
    api.post(`/admin/contests/${id}/publish-results`, { publish }).then(notifyContestChange),
  grantReattempts: (id: string, data: { studentIds: string[]; reason?: string; allowedAttempts?: number; expiresAt?: string }) =>
    api.post(`/admin/contests/${id}/reattempts`, data),
  revokeReattempt: (id: string, targetId: string) =>
    api.post(`/admin/contests/${id}/reattempts/revoke`, { targetId }),
  exportResultsCsv: (id: string) =>
    api.get(`/admin/contests/${id}/results/export`, { responseType: "blob" }),
};

export const adminUsersAPI = {
  getAll: (search = "", adminsOnly = false, page = 1, limit = 50) =>
    api.get(`/admin/users?search=${encodeURIComponent(search)}&adminsOnly=${adminsOnly}&page=${page}&limit=${limit}`),
  getReport: (userId: string) => api.get(`/admin/users/${userId}/report`),
  promote: (userId: string) => api.put(`/admin/users/${userId}/promote`),
  demote: (userId: string) => api.put(`/admin/users/${userId}/demote`),
};

export const adminCompaniesAPI = {
  getAll: (search = "") => api.get(`/admin/companies?search=${encodeURIComponent(search)}`),
  toggleVerify: (id: string) => api.put(`/admin/companies/${id}/verify`),
  delete: (id: string) => api.delete(`/admin/companies/${id}`),
};

export const adminUniversitiesAPI = {
  getAll: (search = "") => api.get(`/admin/universities?search=${encodeURIComponent(search)}`),
  create: (data: { name: string; domain?: string; website?: string; location?: string; contactEmail?: string }) =>
    api.post("/admin/universities", data),
  toggleVerify: (id: string) => api.put(`/admin/universities/${id}/verify`),
  delete: (id: string) => api.delete(`/admin/universities/${id}`),
};

export const adminDashboardAPI = {
  getStats: () => api.get("/admin/dashboard/stats"),
};

export const companyAPI = {
  register: (data: any) => api.post("/company", data),
  getMyCompanies: () => api.get("/company/my-companies"),
  getCompany: (id: string) => api.get(`/company/${id}`, { headers: { "X-Company-ID": id } }),
  updateCompany: (id: string, data: any) => api.put(`/company/${id}`, data, { headers: { "X-Company-ID": id } }),
};

export const companyJobsAPI = {
  getAll: (companyId: string) => api.get("/company/jobs", { headers: { "X-Company-ID": companyId } }),
  create: (companyId: string, data: any) => api.post("/company/jobs", data, { headers: { "X-Company-ID": companyId } }),
  update: (companyId: string, jobId: string, data: any) => api.put(`/company/jobs/${jobId}`, data, { headers: { "X-Company-ID": companyId } }),
  delete: (companyId: string, jobId: string) => api.delete(`/company/jobs/${jobId}`, { headers: { "X-Company-ID": companyId } }),
};

export const companyTeamAPI = {
  getAll: (companyId: string) => api.get("/company/team", { headers: { "X-Company-ID": companyId } }),
  invite: (companyId: string, data: any) => api.post("/company/team/invite", data, { headers: { "X-Company-ID": companyId } }),
  remove: (companyId: string, userId: string) => api.delete(`/company/team/${userId}`, { headers: { "X-Company-ID": companyId } }),
};

export const companyApplicationsAPI = {
  getAll: (companyId: string) => api.get("/company/applications", { headers: { "X-Company-ID": companyId } }),
  updateStage: (companyId: string, id: string, stage: string) => api.put(`/company/applications/${id}/stage`, { stage }, { headers: { "X-Company-ID": companyId } }),
  generateMock: (companyId: string) => api.post("/company/applications/mock", {}, { headers: { "X-Company-ID": companyId } }),
};

export const campusAPI = {
  register: (data: any) => api.post("/campus", data),
  getMyUniversities: () => api.get("/campus/my-universities"),
  getUniversity: (id: string) => api.get(`/campus/${id}`, { headers: { "X-University-ID": id } }),
  updateUniversity: (id: string, data: any) => api.put(`/campus/${id}`, data, { headers: { "X-University-ID": id } }),
};

export const campusBatchesAPI = {
  getAll: (universityId: string) => api.get("/campus/batches", { headers: { "X-University-ID": universityId } }),
  create: (universityId: string, data: any) => api.post("/campus/batches", data, { headers: { "X-University-ID": universityId } }),
  getStudents: (universityId: string, batchId: string) => api.get(`/campus/batches/${batchId}/students`, { headers: { "X-University-ID": universityId } }),
  delete: (universityId: string, batchId: string) => api.delete(`/campus/batches/${batchId}`, { headers: { "X-University-ID": universityId } }),
};

export const campusStudentsAPI = {
  getAll: (universityId: string) => api.get("/campus/students", { headers: { "X-University-ID": universityId } }),
  generateMock: (universityId: string) => api.post("/campus/students/mock", {}, { headers: { "X-University-ID": universityId } }),
};

export const adminStudentsAPI = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    department?: string;
    batch?: string;
    semester?: number;
    isActive?: string;
  }) => api.get("/admin/students", { params }),
  getById: (id: string) => api.get(`/admin/students/${id}`),
  create: (data: any) => api.post("/admin/students", data),
  update: (id: string, data: any) => api.put(`/admin/students/${id}`, data),
  setStatus: (id: string, isActive: boolean) =>
    api.put(`/admin/students/${id}/status`, { isActive }),
  deactivate: (id: string) => api.delete(`/admin/students/${id}`),
  resetPassword: (id: string) => api.post(`/admin/students/${id}/reset-password`),
  importPreview: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/admin/students/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  confirmImport: (validRows: any[]) =>
    api.post("/admin/students/import/confirm", { validRows }),
  sendCredentials: (jobIds?: string[], portalUrl?: string) =>
    api.post("/admin/students/send-credentials", { jobIds, portalUrl }),
  sendSingleCredential: (studentId: string, portalUrl?: string) =>
    api.post(`/admin/students/${studentId}/send-credential`, { portalUrl }),
  retryFailedCredentials: (portalUrl?: string) =>
    api.post("/admin/students/retry-failed", { portalUrl }),
  getEmailStatus: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get("/admin/students/email-status", { params }),
};

export const adminQuestionsAPI = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    topic?: string;
    subtopic?: string;
    difficulty?: string;
    questionType?: string;
    status?: string;
    language?: string;
    aiGenerated?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }, signal?: AbortSignal) => api.get("/admin/questions", { params, signal }),
  getById: (id: string) => api.get(`/admin/questions/${id}`),
  create: (data: any) => api.post("/admin/questions", data),
  update: (id: string, data: any) => api.put(`/admin/questions/${id}`, data),
  delete: (id: string) => api.delete(`/admin/questions/${id}`),
  approve: (id: string) => api.put(`/admin/questions/${id}/approve`),
  reject: (id: string, reason: string) => api.put(`/admin/questions/${id}/reject`, { reason }),
  getTopics: (topic?: string) => api.get("/admin/questions/topics", { params: { topic } }),
  importPreview: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/admin/questions/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  confirmImport: (validRows: any[]) =>
    api.post("/admin/questions/import/confirm", { validRows }),
  autoImport: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/admin/questions/import/auto", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const adminQuestionBanksAPI = {
  getAll: (params?: { topic?: string }) => api.get("/admin/question-banks", { params }),
  getById: (id: string) => api.get(`/admin/question-banks/${id}`),
  create: (data: any) => api.post("/admin/question-banks", data),
  update: (id: string, data: any) => api.put(`/admin/question-banks/${id}`, data),
  delete: (id: string) => api.delete(`/admin/question-banks/${id}`),
};

export const adminAssessmentsAPI = {
  getAll: (params?: { status?: string; search?: string }) =>
    api.get("/admin/assessments", { params }),
  getById: (id: string) => api.get(`/admin/assessments/${id}`),
  create: (data: any) => api.post("/admin/assessments", data),
  update: (id: string, data: any) => api.put(`/admin/assessments/${id}`, data),
  updateStatus: (id: string, status: string) => api.put(`/admin/assessments/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/admin/assessments/${id}`),
  getResults: (id: string) => api.get(`/admin/assessments/${id}/results`),
};

export const studentAssessmentsAPI = {
  getMyAssessments: (signal?: AbortSignal) => api.get("/assessments/my-assessments", { signal }),
  getOverview: (id: string) => api.get(`/assessments/${id}/overview`),
  startAttempt: (id: string) => api.post(`/assessments/${id}/start`),
  saveProgress: (id: string, data: any) => api.post(`/assessments/${id}/save-progress`, data),
  submitAttempt: (id: string, data: any) => api.post(`/assessments/${id}/submit`, data),
  getResult: (id: string) => api.get(`/assessments/${id}/result`),
  retakeAttempt: (id: string) => api.post(`/assessments/${id}/retake`),
};


export const analyticsAPI = {
  getOverview: (assessmentId: string) => api.get(`/admin/analytics/assessment/${assessmentId}/overview`),
  getLeaderboard: (assessmentId: string, params?: { page?: number; limit?: number }) => api.get(`/admin/analytics/assessment/${assessmentId}/leaderboard`, { params }),
  getQuestionAnalytics: (assessmentId: string) => api.get(`/admin/analytics/assessment/${assessmentId}/questions`),
};

export default api;
