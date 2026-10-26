import { awaitExecution } from "@/lib/await-execution";
import { awaitSubmission } from "@/lib/submission-feedback";
import axios from "axios";
import { getBrowserApiBaseURL } from "@/lib/api-base-url";
import { normalizeProblemQuery } from "@/lib/public-problems";
import { logger } from "@/lib/logger";
import { notifyMutationFailure, notifyMutationSuccess } from "@/lib/api-mutation-notifications";

// Dynamically determine the correct API base URL
const getDynamicBaseURL = (): string => {
  if (typeof window !== "undefined") {
    return getBrowserApiBaseURL(process.env.NEXT_PUBLIC_API_URL, window.location);
  }
  return process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001/api";
};

const api = axios.create({
  baseURL: getDynamicBaseURL(),
  timeout: 15000,
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

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers = [];
}

// Handle responses and 401 errors globally with transparent token rotation (AUD-016)
api.interceptors.response.use(
  (res) => {
    if (res.data) {
      normalizeIds(res.data);
    }
    notifyMutationSuccess(res.config.url || "", res.config.method || "");
    return res;
  },
  async (error) => {
    const requestId =
      error.response?.headers?.["x-request-id"] ||
      error.config?.headers?.["x-request-id"] ||
      "unknown";
    const status = error.response?.status;
    const reqUrl = error.config?.url || "";
    const originalRequest = error.config;

    notifyMutationFailure(reqUrl, error.config?.method || "", error);

    if (status && status >= 500) {
      logger.warn("API service error", {
        requestId,
        status,
        url: reqUrl,
        message: error.code === "ECONNABORTED"
          ? "Request timed out"
          : error.message === "Network Error"
            ? "Network unavailable"
            : "Server returned an error",
      }, "APIClient");
    } else if (!status) {
      logger.warn("API request could not reach the service", {
        requestId,
        url: reqUrl,
        message: error.code === "ECONNABORTED" ? "Request timed out" : "Network unavailable",
      }, "APIClient");
    } else if (status >= 400) {
      logger.warn(
        `API request failed: [${status}] ${reqUrl}`,
        {
          requestId,
          status,
          url: reqUrl,
        },
        "APIClient"
      );
    }

    // Handle 429 Too Many Requests with RFC 6585 Retry-After backoff
    if (status === 429 && originalRequest && !originalRequest._retry429) {
      originalRequest._retryCount429 = (originalRequest._retryCount429 || 0) + 1;

      const isAutoRetryable =
        reqUrl.includes("save-progress") ||
        reqUrl.includes("violations") ||
        reqUrl.includes("proctor-capture") ||
        reqUrl.includes("overview") ||
        reqUrl.includes("my-assessments") ||
        originalRequest.method?.toUpperCase() === "GET";

      if (isAutoRetryable && originalRequest._retryCount429 <= 3) {
        if (originalRequest._retryCount429 >= 3) {
          originalRequest._retry429 = true;
        }

        const retryAfterHeader =
          error.response?.headers?.["retry-after"] ||
          error.response?.headers?.["retry-after-short"] ||
          error.response?.headers?.["retry-after-long"];

        let delayMs = 1500;
        if (retryAfterHeader) {
          const parsed = parseInt(String(retryAfterHeader), 10);
          if (!isNaN(parsed) && parsed > 0) {
            delayMs = parsed * 1000;
          }
        } else {
          delayMs = Math.min(
            1000 * Math.pow(2, originalRequest._retryCount429 - 1) + Math.random() * 500,
            6000
          );
        }

        logger.warn(
          `[429 Rate Limit] ${reqUrl} throttled. Retrying in ${Math.round(delayMs)}ms (attempt ${originalRequest._retryCount429}/3)...`,
          { requestId, url: reqUrl, delayMs },
          "APIClient"
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return api(originalRequest);
      }
    }

    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      originalRequest &&
      !originalRequest._retry
    ) {
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
        reqUrl.includes("auth/register") ||
        reqUrl.includes("auth/refresh");

      const refreshToken = localStorage.getItem("codeskill_refresh_token");

      if (!isAuthPage && !isAuthRequest && refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            refreshSubscribers.push((newToken: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              resolve(api.request(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshBase = getDynamicBaseURL().replace(/\/+$/, "");
        return axios
          .post(`${refreshBase}/auth/refresh`, { refreshToken })
          .then((refreshRes) => {
            const newToken = refreshRes.data?.token;
            const newRefreshToken = refreshRes.data?.refreshToken;
            if (newToken) {
              localStorage.setItem("codeskill_token", newToken);
              if (newRefreshToken) {
                localStorage.setItem("codeskill_refresh_token", newRefreshToken);
              }
              onRefreshed(newToken);
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return api.request(originalRequest);
            }
            throw new Error("Invalid token refresh payload");
          })
          .catch((refreshErr) => {
            onRefreshFailed();
            localStorage.removeItem("codeskill_token");
            localStorage.removeItem("codeskill_refresh_token");
            window.dispatchEvent(new Event("codeskill:session-expired"));
            const isPublicPage =
              pathname === "/" ||
              pathname === "/problems" ||
              pathname.startsWith("/problems/");
            if (!isPublicPage) {
              window.location.href = "/login";
            }
            return Promise.reject(refreshErr);
          })
          .finally(() => {
            isRefreshing = false;
          });
      }

      // If no refresh token or on auth page/request:
      if (!isAuthPage && !isAuthRequest) {
        localStorage.removeItem("codeskill_token");
        localStorage.removeItem("codeskill_refresh_token");
        window.dispatchEvent(new Event("codeskill:session-expired"));
        const isPublicPage =
          pathname === "/" ||
          pathname === "/problems" ||
          pathname.startsWith("/problems/");
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
  refresh: (data: { refreshToken: string }) => api.post("/auth/refresh", data),
  logout: (data?: { refreshToken?: string }) => api.post("/auth/logout", data || {}),
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
  getAll: (page = 1, limit = 20, search = "", category = "All Topics", signal?: AbortSignal, difficulty?: string) => {
    const params: { page: number; limit: number; search?: string; category?: string; difficulty?: string } = { page, limit };
    const query = normalizeProblemQuery(search);
    const topic = normalizeProblemQuery(category, true);
    if (query) params.search = query;
    if (topic) params.category = topic;
    if (difficulty && difficulty !== "All") params.difficulty = difficulty;
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
export interface ProblemStats {
  problemId: string;
  totalSubmissions: number;
  acceptedSubmissions: number;
  acceptanceRate: number;
  solvers: number;
  acceptedSolvers: number;
}

export const submissionAPI = {
  getProgress: (problemIds: string[], signal?: AbortSignal) =>
    api.get<{ data: { problemId: string; status: 'solved' | 'attempted' }[] }>("/submissions/progress", { params: { problemIds: problemIds.join(',') }, signal }),
  submit: (data: any) =>
    api.post("/submissions", data),
  getSubmissions: (problemId: number | string) => api.get(`/submissions/problem/${problemId}`),
  getById: (id: string) => api.get(`/submissions/${id}`),
  getResult: (id: string) => api.get(`/submissions/${id}/result`),
  getProblemStats: (problemId: string) => api.get<ProblemStats>(`/submissions/problem/${problemId}/stats`),
  submitAndWait: (data: { problemId: string; code: string; language: string }, onStatus?: (status: string) => void) =>
    awaitSubmission(() => api.post('/submissions', data), id => api.get(`/submissions/${id}/result`), onStatus),
  awaitResult: async (submissionId: string, options: { timeoutMs?: number; intervalMs?: number } = {}) => {
    const deadline = Date.now() + (options.timeoutMs ?? 60000);
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 1000));
      const res = await api.get(`/submissions/${submissionId}/result`);
      const data = res.data;
      if (
        data &&
        (data.completedAt ||
          [
            'completed',
            'accepted',
            'wrong_answer',
            'compile_error',
            'runtime_error',
            'time_limit',
            'memory_limit',
            'failed',
            'cancelled',
          ].includes(data.status))
      ) {
        return res;
      }
    }
    throw new Error('Submission evaluation timed out in queue.');
  },
};

export interface ComplexityAnalysis {
  timeComplexity: string;
  spaceComplexity: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
}

export const runAPI = {
  runtimes: () => api.get<Array<{ language: string; version?: string; enabled: boolean }>>("/execution/runtimes"),
  run: (data: { code: string; language: string; testCases: any[]; config?: any; executionId?: string }) =>
    api.post("/execution/run", data, { timeout: 60000 }),
  getJob: (jobId: string) => api.get(`/execution/jobs/${jobId}`, { timeout: 60000 }),
  analyzeComplexity: (data: { code: string; language: string }) =>
    api.post<ComplexityAnalysis & { success: boolean }>("/execution/analyze-complexity", data, { timeout: 30000 }),
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
  getAll: (params?: { page?: number; limit?: number; search?: string; contestEligible?: boolean }, signal?: AbortSignal) =>
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
  importPreview: (file: File, defaultOptions?: any) => {
    const formData = new FormData();
    formData.append("file", file);
    if (defaultOptions) {
      Object.entries(defaultOptions).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          formData.append(k, String(v));
        }
      });
    }
    return api.post("/admin/students/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  confirmImport: (validRows: any[], defaultOptions?: any) =>
    api.post("/admin/students/import/confirm", { validRows, defaultOptions }),
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
  bulkUpdate: (ids: string[], updates: any) => api.put("/admin/questions/bulk", { ids, updates }),
  delete: (id: string) => api.delete(`/admin/questions/${id}`),
  approve: (id: string) => api.put(`/admin/questions/${id}/approve`),
  reject: (id: string, reason: string) => api.put(`/admin/questions/${id}/reject`, { reason }),
  getTopics: (topic?: string) => api.get("/admin/questions/topics", { params: { topic } }),
  importPreview: (file: File, sheetName?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (sheetName) formData.append("sheetName", sheetName);
    return api.post("/admin/questions/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  confirmImport: (validRows: any[], mergeStrategy?: 'skip' | 'update' | 'merge') =>
    api.post("/admin/questions/import/confirm", { validRows, mergeStrategy }),
  autoImport: (file: File, mergeStrategy?: 'skip' | 'update' | 'merge', sheetName?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (sheetName) formData.append("sheetName", sheetName);
    return api.post(`/admin/questions/import/auto${mergeStrategy ? `?mergeStrategy=${mergeStrategy}` : ""}`, formData, {
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
  getAttemptReport: (attemptId: string) =>
    api.get(`/reports/assessment-attempt/${encodeURIComponent(attemptId)}`, { responseType: "blob" }),
};

export const adminBugsAPI = {
  getAll: (params?: { search?: string; sort?: "newest" | "oldest" | "priority" }) =>
    api.get("/admin/bugs", { params }),
  getById: (id: string) => api.get(`/admin/bugs/${id}`),
  create: (data: FormData) =>
    api.post("/admin/bugs", data, { headers: { "Content-Type": "multipart/form-data" } }),
  assign: (id: string, assigneeName: string) =>
    api.put(`/admin/bugs/${id}/assign`, { assigneeName }),
  updateStatus: (id: string, status: "fixed" | "new") =>
    api.put(`/admin/bugs/${id}/status`, { status }),
  updateBug: (id: string, data: { title: string; description: string }) =>
    api.put(`/admin/bugs/${id}`, data),
  addImages: (id: string, data: FormData) =>
    api.post(`/admin/bugs/${id}/images`, data, { headers: { "Content-Type": "multipart/form-data" } }),
  addComment: (id: string, data: { commenterName: string; text: string }) =>
    api.post(`/admin/bugs/${id}/comments`, data),
  updateComment: (id: string, commentId: string, text: string) =>
    api.put(`/admin/bugs/${id}/comments/${commentId}`, { text }),
};

export const studentAssessmentsAPI = {
  evaluateCode: (id: string, data: { questionId: string; code: string; language: string }) => awaitExecution(
    () => api.post(`/assessments/${id}/evaluate-code`, data), jobId => runAPI.getJob(jobId),
  ),
  getMyAssessments: (signal?: AbortSignal) => api.get("/assessments/my-assessments", { signal }),
  getOverview: (id: string) => api.get(`/assessments/${id}/overview`),
  startAttempt: (id: string) => api.post(`/assessments/${id}/start`),
  saveProgress: (id: string, data: any) => api.post(`/assessments/${id}/save-progress`, data),
  submitAttempt: (id: string, data: any) => api.post(`/assessments/${id}/submit`, data),
  getResult: (id: string) => api.get(`/assessments/${id}/result`),
  retakeAttempt: (id: string) => api.post(`/assessments/${id}/retake`),
  recordProctorCapture: (id: string, data: { type: string; image: string; filename: string; timestamp: string }) =>
    api.post(`/assessments/${id}/proctor-capture`, data),
};


export const analyticsAPI = {
  // Platform-wide analytics endpoints connected to backend & PostgreSQL
  getPlatformOverview: () => api.get("/admin/analytics/overview"),
  getActivity: (params?: { period?: string; startDate?: string; endDate?: string }) =>
    api.get("/admin/analytics/activity", { params }),
  getLanguages: () => api.get("/admin/analytics/languages"),
  getLeaderboard: (params?: { page?: number; limit?: number; type?: string }) =>
    api.get("/admin/analytics/leaderboard", { params }),
  getAssessments: () => api.get("/admin/analytics/assessments"),
  getRetention: () => api.get("/admin/analytics/retention"),

  // Assessment-specific analytics endpoints
  getOverview: (assessmentId: string) => api.get(`/admin/analytics/assessment/${assessmentId}/overview`),
  getAssessmentLeaderboard: (assessmentId: string, params?: { page?: number; limit?: number }) =>
    api.get(`/admin/analytics/assessment/${assessmentId}/leaderboard`, { params }),
  getQuestionAnalytics: (assessmentId: string) => api.get(`/admin/analytics/assessment/${assessmentId}/questions`),
};

export const learningAPI = {
  getPaths: (params?: { search?: string; difficulty?: string; tag?: string }) =>
    api.get("/learning/paths", { params }),
  getPathBySlug: (slug: string) => api.get(`/learning/paths/${slug}`),
  enroll: (pathId: string) => api.post(`/learning/paths/${pathId}/enroll`),
  getCourse: (courseId: string) => api.get(`/learning/courses/${courseId}`),
  getLesson: (lessonId: string) => api.get(`/learning/lessons/${lessonId}`),
  getLessonCompletionStatus: (lessonId: string) =>
    api.get<{
      lessonId: string;
      canComplete: boolean;
      reasons: string[];
      criteria: {
        timeSpent: number;
        requiredTime: number;
        timeRemaining: number;
        timeMet: boolean;
        quizMet: boolean;
        codingMet: boolean;
      };
    }>(`/learning/lessons/${lessonId}/completion-status`),
  trackTimeSpent: (lessonId: string, seconds: number) =>
    api.post(`/learning/lessons/${lessonId}/time-spent`, { seconds }),
  completeLesson: (lessonId: string, timeSpentSeconds?: number) =>
    api.post(`/learning/lessons/${lessonId}/complete`, { timeSpentSeconds }),
  submitExercise: (exerciseId: string, data: { code?: string; language?: string; selectedOption?: number; answers?: Record<string, number> }) =>
    api.post(`/learning/exercises/${exerciseId}/submit`, data),
  getMyProgress: () => api.get("/learning/me/progress"),
  getMyAchievements: () => api.get("/learning/me/achievements"),
  getMyCertificates: () => api.get("/learning/me/certificates"),
  issueCertificate: (pathId: string) => api.post(`/learning/paths/${pathId}/certify`),
  runPlayground: (data: { code: string; language: string; stdin?: string }) =>
    api.post<{
      success: boolean;
      output: string;
      error: string;
      status: string;
      durationMs: number;
    }>("/learning/playground/run", data),
};

export const adminLearningAPI = {
  getOverview: () => api.get("/admin/learning/overview"),
  getPaths: () => api.get("/admin/learning/paths"),
  createPath: (data: any) => api.post("/admin/learning/paths", data),
  updatePath: (id: string, data: any) => api.patch(`/admin/learning/paths/${id}`, data),
  publishPath: (id: string) => api.post(`/admin/learning/paths/${id}/publish`),
  getPathDetails: (id: string) => api.get(`/admin/learning/paths/${id}`),
  deletePath: (id: string) => api.delete(`/admin/learning/paths/${id}`),
  getCourses: () => api.get("/admin/learning/courses"),
  createCourse: (data: any) => api.post("/admin/learning/courses", data),
  updateCourse: (id: string, data: any) => api.patch(`/admin/learning/courses/${id}`, data),
  deleteCourse: (id: string) => api.delete(`/admin/learning/courses/${id}`),
  createModule: (courseId: string, data: any) => api.post(`/admin/learning/courses/${courseId}/modules`, data),
  updateModule: (moduleId: string, data: any) => api.patch(`/admin/learning/modules/${moduleId}`, data),
  deleteModule: (moduleId: string) => api.delete(`/admin/learning/modules/${moduleId}`),
  createLesson: (moduleId: string, data: any) => api.post(`/admin/learning/modules/${moduleId}/lessons`, data),
  updateLesson: (id: string, data: any) => api.patch(`/admin/learning/lessons/${id}`, data),
  deleteLesson: (id: string) => api.delete(`/admin/learning/lessons/${id}`),
  createExercise: (lessonId: string, data: any) => api.post(`/admin/learning/lessons/${lessonId}/exercises`, data),
  deleteExercise: (id: string) => api.delete(`/admin/learning/exercises/${id}`),
  getBadges: () => api.get("/admin/learning/badges"),
  createBadge: (data: any) => api.post("/admin/learning/badges", data),
  getCertificates: () => api.get("/admin/learning/certificates"),
  getTemplates: () => api.get("/admin/learning/certificate-templates"),
  createTemplate: (data: any) => api.post("/admin/learning/certificate-templates", data),
  revokeCertificate: (id: string, reason: string) => api.post(`/admin/learning/certificates/${id}/revoke`, { reason }),
};

export const certificateVerificationAPI = {
  verify: (credentialId: string) => api.get(`/certificates/verify/${credentialId}`),
};

export default api;
