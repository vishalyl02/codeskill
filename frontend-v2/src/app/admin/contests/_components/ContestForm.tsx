"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminContestsAPI, adminProblemsAPI } from "@/config/api";
import Link from "next/link";
import { ArrowLeft, Save, Search, CheckCircle2, ShieldCheck } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { isAxiosError } from "axios";

interface ProblemOption { _id: string; title: string; slug: string; difficulty: string }
interface ContestData {
  title: string; slug: string; description: string; startTime: string; endTime: string;
  isPrivate: boolean; password?: string; isPublished: boolean; problems: string[];
  antiCheatConfig?: {
    enableTabSwitchDetection?: boolean;
    enableFullscreenCheck?: boolean;
    maxTabSwitchViolations?: number;
    warningLimit?: number;
    actionOnMaxViolations?: "auto_submit" | "lock_attempt" | "flag_review";
  };
  resultsPublished?: boolean;
}

// datetime-local uses the administrator's local time, while the API stores UTC.
function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const part = (value: number) => String(value).padStart(2, "0");
  const seconds = date.getSeconds() || date.getMilliseconds()
    ? `:${part(date.getSeconds())}${date.getMilliseconds() ? `.${String(date.getMilliseconds()).padStart(3, "0")}` : ""}` : "";
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}${seconds}`;
}

function errorMessage(error: unknown, fallback: string) {
  const message = isAxiosError<{ message?: string | string[] }>(error) ? error.response?.data?.message : undefined;
  return Array.isArray(message) ? message.join(" ") : message || fallback;
}

export default function ContestForm({ contestId }: { contestId?: string }) {
  const isEditing = !!contestId;
  const [loaded, setLoaded] = useState(!contestId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    startTime: "",
    endTime: "",
    isPrivate: false,
    password: "",
    isPublished: false,
    enableTabSwitchDetection: true,
    enableFullscreenCheck: true,
    maxTabSwitchViolations: 3,
    actionOnMaxViolations: "auto_submit" as "auto_submit" | "lock_attempt" | "flag_review",
    resultsPublished: false,
  });
  
  // Problems State
  const [allProblems, setAllProblems] = useState<ProblemOption[]>([]);
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const [problemSearch, setProblemSearch] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      adminProblemsAPI.getAll(),
      contestId ? adminContestsAPI.getById(contestId) : Promise.resolve(null),
    ]).then(([problemsResponse, contestResponse]) => {
      if (!active) return;
      setAllProblems(problemsResponse.data.problems || []);
      if (contestResponse) {
        const contest: ContestData = contestResponse.data.contest || contestResponse.data;
        const antiCheat = contest.antiCheatConfig || {};
        setFormData({
          title: contest.title,
          slug: contest.slug,
          description: contest.description,
          startTime: toLocalDateTime(contest.startTime),
          endTime: toLocalDateTime(contest.endTime),
          isPrivate: !!contest.isPrivate,
          password: contest.password || "",
          isPublished: !!contest.isPublished,
          enableTabSwitchDetection: antiCheat.enableTabSwitchDetection !== false,
          enableFullscreenCheck: antiCheat.enableFullscreenCheck !== false,
          maxTabSwitchViolations: antiCheat.maxTabSwitchViolations ?? antiCheat.warningLimit ?? 3,
          actionOnMaxViolations: antiCheat.actionOnMaxViolations || "auto_submit",
          resultsPublished: contest.resultsPublished === true,
        });
        setSelectedProblems(contest.problems || []);
      }
      setLoaded(true);
      setLoadError(null);
    }).catch((error: unknown) => {
      if (active) setLoadError(errorMessage(error, "Unable to load the contest form. Please try again."));
    });
    return () => { active = false; };
  }, [contestId, retry]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    // Auto-generate slug from title
    if (name === "title" && !isEditing) {
      const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      setFormData(prev => ({ ...prev, title: value, slug }));
      return;
    }

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const toggleProblemSelection = (id: string) => {
    setSelectedProblems(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaded || loading) return;
    if (selectedProblems.length === 0) {
      setError("Select at least one problem for the contest.");
      return;
    }
    const start = new Date(formData.startTime);
    const end = new Date(formData.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Valid start and end times are required.");
      return;
    }
    if (end <= start) {
      setError("End time must be after start time.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        title: formData.title,
        slug: formData.slug,
        description: formData.description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        isPrivate: formData.isPrivate,
        password: formData.password,
        isPublished: formData.isPublished,
        problems: selectedProblems,
        antiCheatConfig: {
          enableTabSwitchDetection: formData.enableTabSwitchDetection,
          enableFullscreenCheck: formData.enableFullscreenCheck,
          maxTabSwitchViolations: Math.max(1, Number(formData.maxTabSwitchViolations) || 3),
          warningLimit: Math.max(1, Number(formData.maxTabSwitchViolations) || 3),
          actionOnMaxViolations: formData.actionOnMaxViolations,
        },
        resultsPublished: formData.resultsPublished,
      };
      if (contestId) await adminContestsAPI.update(contestId, payload);
      else await adminContestsAPI.create(payload);
      router.push(`/admin/contests?${isEditing ? "updated" : "created"}=${encodeURIComponent(formData.slug)}`);
      router.refresh();
    } catch (err: unknown) {
      setError(errorMessage(err, `Failed to ${isEditing ? "update" : "create"} contest`));
      setLoading(false);
    }
  };

  const filteredProblems = allProblems.filter(p => 
    p.title.toLowerCase().includes(problemSearch.toLowerCase()) ||
    p.slug.toLowerCase().includes(problemSearch.toLowerCase())
  );

  if (!loaded) {
    return <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{isEditing ? "Edit Contest" : "Create New Contest"}</h1>
      {loadError ? <><p role="alert" className="text-red-500">{loadError}</p>
        <button type="button" onClick={() => { setLoadError(null); setRetry(value => value + 1); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Try again</button></>
        : <p role="status" className="flex items-center gap-2"><Spinner /> Loading contest form...</p>}
      <Link href="/admin/contests" className="block text-primary">Back to Contests</Link>
    </div>;
  }

  return (
    <div className="p-4 sm:p-8 font-sans max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/contests" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Contests
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{isEditing ? "Edit Contest" : "Create New Contest"}</h1>
        <p className="text-muted-foreground text-sm mt-1">{isEditing ? "Update the contest details, schedule, and selected problems." : "Schedule a new coding competition and select problems."}</p>
      </div>

      {loadError && <div className="mb-6 space-y-2">
        <p role="alert" className="text-red-500">{loadError}</p>
        <button type="button" onClick={() => { setLoadError(null); setRetry(value => value + 1); }} className="text-primary underline">Retry loading problems</button>
      </div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="p-4 bg-red-500/10 text-red-400 text-sm rounded-lg border border-red-500/20">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Details (Left Col) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
              <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">Contest Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="contest-title" className="text-sm font-medium text-foreground">Contest Title <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    id="contest-title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Weekly Algorithm Challenge #1"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="contest-slug" className="text-sm font-medium text-foreground">URL Slug <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    id="contest-slug"
                    name="slug"
                    value={formData.slug}
                    onChange={handleChange}
                    required
                    placeholder="e.g. weekly-algo-1"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="contest-description" className="text-sm font-medium text-foreground">Description <span className="text-red-500">*</span></label>
                <textarea 
                  id="contest-description"
                    name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  rows={4}
                  placeholder="Describe the contest rules and objectives..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-y"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="contest-startTime" className="text-sm font-medium text-foreground">Start Time <span className="text-red-500">*</span></label>
                  <input 
                    type="datetime-local"
                    step="any" 
                    id="contest-startTime"
                    name="startTime"
                    value={formData.startTime}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="contest-endTime" className="text-sm font-medium text-foreground">End Time <span className="text-red-500">*</span></label>
                  <input 
                    type="datetime-local"
                    step="any" 
                    id="contest-endTime"
                    name="endTime"
                    value={formData.endTime}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Problem Selection Section */}
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6 flex flex-col h-[500px]">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h2 className="text-lg font-semibold text-foreground">Select Problems <span className="text-red-500">*</span></h2>
                <span className="text-sm font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                  {selectedProblems.length} Selected
                </span>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search problem bank..." 
                  value={problemSearch}
                  onChange={(e) => setProblemSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {filteredProblems.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">No problems found.</div>
                ) : (
                  filteredProblems.map(problem => {
                    const isSelected = selectedProblems.includes(problem._id);
                    return (
                      <div 
                        key={problem._id}
                        onClick={() => toggleProblemSelection(problem._id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected 
                            ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(37,99,235,0.2)]' 
                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>{problem.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{problem.difficulty} • {problem.slug}</p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Details (Right Col) */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
              <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">Access & Publishing</h2>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input 
                      type="checkbox"
                      id="isPrivate"
                      name="isPrivate"
                      checked={formData.isPrivate}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="isPrivate" className="text-sm font-medium text-foreground cursor-pointer">Private Contest</label>
                    <p className="text-xs text-muted-foreground mt-1">Require a password for users to access this contest.</p>
                  </div>
                </div>

                {formData.isPrivate && (
                  <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label htmlFor="contest-password" className="text-sm font-medium text-foreground">Contest Password</label>
                    <input 
                      type="text" 
                      id="contest-password"
                    name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Enter access code..."
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                )}
                
                <hr className="border-border my-4" />

                <div className="flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input 
                      type="checkbox"
                      id="isPublished"
                      name="isPublished"
                      checked={formData.isPublished}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="isPublished" className="text-sm font-medium text-foreground cursor-pointer">Publish Contest</label>
                    <p className="text-xs text-muted-foreground mt-1">Make this contest visible on the platform (respects Start Time for actual access).</p>
                  </div>
                </div>

                <hr className="border-border my-4" />

                <div className="flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input 
                      type="checkbox"
                      id="resultsPublished"
                      name="resultsPublished"
                      checked={formData.resultsPublished}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="resultsPublished" className="text-sm font-medium text-foreground cursor-pointer">Publish Results to Students</label>
                    <p className="text-xs text-muted-foreground mt-1">Allow students to see their scores, ranks, and solved problems.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Exam Security & Anti-Cheat Settings */}
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <ShieldCheck className="w-5 h-5 text-sky-500" />
                <h2 className="text-lg font-semibold text-foreground">Exam Security & Anti-Cheat</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input 
                      type="checkbox"
                      id="enableTabSwitchDetection"
                      name="enableTabSwitchDetection"
                      checked={formData.enableTabSwitchDetection}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="enableTabSwitchDetection" className="text-sm font-medium text-foreground cursor-pointer">Monitor Tab-Switching</label>
                    <p className="text-xs text-muted-foreground mt-0.5">Detect when students change browser tabs or leave contest page.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input 
                      type="checkbox"
                      id="enableFullscreenCheck"
                      name="enableFullscreenCheck"
                      checked={formData.enableFullscreenCheck}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="enableFullscreenCheck" className="text-sm font-medium text-foreground cursor-pointer">Enforce Fullscreen Mode</label>
                    <p className="text-xs text-muted-foreground mt-0.5">Track fullscreen exit events as security violations.</p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label htmlFor="maxTabSwitchViolations" className="text-sm font-medium text-foreground">
                    Max Violation Count (Default: 3)
                  </label>
                  <input 
                    type="number"
                    min="1"
                    max="20"
                    id="maxTabSwitchViolations"
                    name="maxTabSwitchViolations"
                    value={formData.maxTabSwitchViolations}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                  <p className="text-xs text-muted-foreground">Allowed warnings before contest action triggers.</p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label htmlFor="actionOnMaxViolations" className="text-sm font-medium text-foreground">
                    Action on Limit Reached
                  </label>
                  <select
                    id="actionOnMaxViolations"
                    name="actionOnMaxViolations"
                    value={formData.actionOnMaxViolations}
                    onChange={(e) => setFormData(prev => ({ ...prev, actionOnMaxViolations: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  >
                    <option value="auto_submit">Auto-Submit Attempt</option>
                    <option value="lock_attempt">Lock Attempt (Requires Admin Re-entry)</option>
                    <option value="flag_review">Flag Attempt for Review</option>
                  </select>
                  <p className="text-xs text-muted-foreground">Policy applied when student reaches configured violation limit.</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button 
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Spinner className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {loading ? "Saving..." : isEditing ? "Save Changes" : "Create Contest"}
              </button>
              <Link 
                href="/admin/contests"
                className="flex items-center justify-center px-6 py-3 text-sm font-medium text-muted-foreground bg-card border border-border rounded-xl hover:bg-muted/40 transition-colors shadow-sm"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
