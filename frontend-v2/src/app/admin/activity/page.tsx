"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { adminActivityAPI } from "@/config/api";
import {
  Activity,
  Search,
  Download,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  User,
  Clock,
  Laptop,
  Globe,
  Filter,
  Eye,
  X,
  ChevronDown,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  FileCode2,
  GraduationCap,
  Users,
  Calendar,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/context/AuthContext";
import { ActivityDiffViewer } from "@/components/admin/ActivityDiffViewer";

interface ActivityLogItem {
  id: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  target?: string;
  targetType?: string;
  studentId?: string;
  attemptId?: string;
  assessmentId?: string;
  event?: string;
  riskWeight: number;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, any>;
  timestamp: string;
}

interface ActivityStats {
  totalEvents: number;
  eventsToday: number;
  activeStudents15m: number;
  activeAdmins15m: number;
  securityAlertsToday: number;
}

export default function AdminActivityPage() {
  const { user: currentUser } = useAuth();

  // Primary data states
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filter states
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [role, setRole] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [timeRange, setTimeRange] = useState("all");
  const [groupSimilar, setGroupSimilar] = useState(true);

  // Floating live banner states
  const [newCount, setNewCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Inspection drawer & Student 360° modal
  const [selectedEvent, setSelectedEvent] = useState<ActivityLogItem | null>(null);
  const [student360, setStudent360] = useState<{ id: string; name?: string; email?: string } | null>(null);
  const [student360Logs, setStudent360Logs] = useState<ActivityLogItem[]>([]);
  const [student360Loading, setStudent360Loading] = useState(false);

  // Ref for the latest log timestamp to poll for new items
  const latestTimestampRef = useRef<string | null>(null);

  // Compute date bounds based on timeRange
  const getDateRangeBounds = useCallback(() => {
    const now = new Date();
    if (timeRange === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { startDate: today.toISOString() };
    }
    if (timeRange === "7d") {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: past7.toISOString() };
    }
    if (timeRange === "30d") {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: past30.toISOString() };
    }
    return {};
  }, [timeRange]);

  // Initial and filtered fetch
  const fetchLogs = useCallback(
    async (reset = true) => {
      try {
        if (reset) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        const dateBounds = getDateRangeBounds();
        const params: Record<string, any> = {
          limit: 30,
          search: search.trim() || undefined,
          category: category !== "all" ? category : undefined,
          role: role !== "all" ? role : undefined,
          severity: severity !== "all" ? severity : undefined,
          ...dateBounds,
        };

        if (!reset && nextCursor) {
          params.cursor = nextCursor;
        }

        const res = await adminActivityAPI.getLogs(params);
        const data = res.data?.data || res.data;
        const items: ActivityLogItem[] = data?.items || [];

        if (reset) {
          setLogs(items);
          if (items.length > 0) {
            latestTimestampRef.current = items[0].timestamp;
          }
          setNewCount(0);
        } else {
          setLogs((prev) => [...prev, ...items]);
        }

        setNextCursor(data?.nextCursor || null);
        setHasMore(Boolean(data?.hasMore));
      } catch (err) {
        console.error("Failed to load activity logs", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, category, role, severity, getDateRangeBounds, nextCursor],
  );

  // Fetch KPI stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await adminActivityAPI.getStats();
      const s = res.data?.stats || res.data;
      if (s) {
        setStats(s);
      }
    } catch (err) {
      console.error("Failed to fetch activity stats", err);
    }
  }, []);

  // Debounced search & filter trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs(true);
    }, 280);
    return () => clearTimeout(timer);
  }, [search, category, role, severity, timeRange]);

  // Initial stats fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Non-disruptive polling for floating "X new events" banner (every 12 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!latestTimestampRef.current) return;
      try {
        const dateBounds = getDateRangeBounds();
        const res = await adminActivityAPI.getCountSince(latestTimestampRef.current, {
          search: search.trim() || undefined,
          category: category !== "all" ? category : undefined,
          role: role !== "all" ? role : undefined,
          severity: severity !== "all" ? severity : undefined,
          ...dateBounds,
        });
        const count = res.data?.count || 0;
        setNewCount(count);
      } catch (err) {
        // Silent polling failure
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [search, category, role, severity, getDateRangeBounds]);

  // Load new items when user clicks floating banner
  const handleLoadNew = () => {
    fetchLogs(true);
    fetchStats();
  };

  // Student 360° timeline fetch
  const openStudent360 = async (student: { id: string; name?: string; email?: string }) => {
    setStudent360(student);
    setStudent360Loading(true);
    try {
      const res = await adminActivityAPI.getLogs({
        actorId: student.id,
        limit: 50,
      });
      const data = res.data?.data || res.data;
      setStudent360Logs(data?.items || []);
    } catch (err) {
      console.error("Failed to fetch student 360 logs", err);
    } finally {
      setStudent360Loading(false);
    }
  };

  // CSV Export handler (streamed blob)
  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const dateBounds = getDateRangeBounds();
      const res = await adminActivityAPI.exportCsv({
        search: search.trim() || undefined,
        category: category !== "all" ? category : undefined,
        role: role !== "all" ? role : undefined,
        severity: severity !== "all" ? severity : undefined,
        limit: 20000,
        ...dateBounds,
      });

      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codeskill-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export activity CSV", err);
      alert("Failed to export activity logs. Please try narrowing your filters.");
    } finally {
      setIsExporting(false);
    }
  };

  // Optional event grouping to collapse repeated noisy warnings
  const processedLogs = useMemo(() => {
    if (!groupSimilar) return logs.map((l) => ({ item: l, count: 1 }));

    const result: { item: ActivityLogItem; count: number }[] = [];
    for (const log of logs) {
      const last = result[result.length - 1];
      if (
        last &&
        last.item.action === log.action &&
        last.item.actorId === log.actorId &&
        (last.item.studentId === log.studentId || !log.studentId) &&
        Math.abs(new Date(last.item.timestamp).getTime() - new Date(log.timestamp).getTime()) <
          5 * 60 * 1000
      ) {
        last.count += 1;
      } else {
        result.push({ item: log, count: 1 });
      }
    }
    return result;
  }, [logs, groupSimilar]);

  // Format relative time
  const formatRelativeTime = (timestamp: string) => {
    const diff = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Render action badge styling
  const getActionBadge = (action: string, riskWeight: number) => {
    if (action.startsWith("CHEATING_RADAR_")) {
      return {
        bg: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/35",
        icon: ShieldAlert,
      };
    }
    if (riskWeight >= 4 || action.includes("VIOLATION") || action.includes("FAILED")) {
      return {
        bg: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25",
        icon: ShieldAlert,
      };
    }
    if (riskWeight > 0 || action.includes("WARNING") || action.includes("BLUR")) {
      return {
        bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
        icon: AlertTriangle,
      };
    }
    if (action.includes("ACCEPTED") || action.includes("SUCCESS")) {
      return {
        bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
        icon: CheckCircle2,
      };
    }
    return {
      bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
      icon: Activity,
    };
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Activity Monitoring
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Live
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time audit stream and historical activity log across students and administrators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isExporting ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => handleLoadNew()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Total Recorded</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? stats.totalEvents.toLocaleString() : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            +{stats?.eventsToday.toLocaleString() || 0} today
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Active Students (15m)</span>
            <GraduationCap className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? stats.activeStudents15m.toLocaleString() : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Engaged on platform</p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Active Staff / Admins</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? stats.activeAdmins15m.toLocaleString() : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Online staff sessions</p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Security Flags (Today)</span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats ? stats.securityAlertsToday.toLocaleString() : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Tab switches & warnings</p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by actor name, email, roll number, IP, or target..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Dropdown */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2.5 py-2 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="auth">Authentication</option>
              <option value="assessment">Assessments</option>
              <option value="submission">Code Submissions</option>
              <option value="security">Security & Proctoring</option>
              <option value="radar">Cheating Radar (Flags)</option>
              <option value="question">Question Bank</option>
              <option value="user">User Management</option>
              <option value="contest">Contests</option>
            </select>

            {/* Role Dropdown */}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-2.5 py-2 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="student">Students</option>
              <option value="admin">Administrators</option>
              <option value="teacher">Teachers</option>
            </select>

            {/* Severity Dropdown */}
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="px-2.5 py-2 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="normal">Normal (Info)</option>
              <option value="warning">Warning (Medium)</option>
              <option value="critical">Critical / High Risk</option>
            </select>

            {/* Time range */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-2.5 py-2 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
            >
              <option value="all">All Time (Inception)</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>

            {/* Group similar toggle */}
            <button
              type="button"
              onClick={() => setGroupSimilar(!groupSimilar)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                groupSimilar
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
              title="Group repeated identical events within 5 minutes"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Group Repeated</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating "New Events" Banner (Twitter/Datadog style) */}
      {newCount > 0 && (
        <div className="sticky top-2 z-20 flex justify-center">
          <button
            type="button"
            onClick={handleLoadNew}
            className="animate-bounce inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:brightness-110 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {newCount} new event{newCount > 1 ? "s" : ""} recorded — Click to update feed
            </span>
          </button>
        </div>
      )}

      {/* Main Activity Feed Table */}
      <div className="rounded-2xl bg-card border border-border/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Streaming platform activity logs...</p>
          </div>
        ) : processedLogs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
            <p className="text-sm font-semibold text-foreground">No activity events found</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No matching activity records found for the selected filters. Try broadening your search or date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Context</th>
                  <th className="py-3 px-4">Client / IP</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {processedLogs.map(({ item: log, count }) => {
                  const badge = getActionBadge(log.action, log.riskWeight);
                  const BadgeIcon = badge.icon;
                  const actorName = log.metadata?.actorName || log.actorEmail?.split("@")[0] || "System";
                  const actorRole = log.metadata?.actorRole || (log.studentId ? "student" : "admin");
                  const actorUid = log.metadata?.actorUid || "";

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedEvent(log)}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground font-mono text-[11px]" title={log.timestamp}>
                        {formatRelativeTime(log.timestamp)}
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">
                            {actorName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="font-semibold text-foreground hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (log.actorId || log.studentId) {
                                    openStudent360({
                                      id: log.actorId || log.studentId || "",
                                      name: actorName,
                                      email: log.actorEmail,
                                    });
                                  }
                                }}
                              >
                                {actorName}
                              </span>
                              {count > 1 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-muted text-foreground border border-border">
                                  ×{count}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              <span>{log.actorEmail}</span>
                              {actorUid && <span>· UID: {actorUid}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge.bg}`}
                          >
                            <BadgeIcon className="w-3 h-3" />
                            {log.action}
                          </span>
                        </div>
                      </td>

                      {/* Target Context */}
                      <td className="py-3 px-4 max-w-[220px] truncate">
                        {log.targetType || log.target ? (
                          <div className="truncate">
                            <span className="font-medium text-foreground">{log.target || log.targetType}</span>
                            {log.targetType && log.target && (
                              <span className="text-[10px] text-muted-foreground block truncate">
                                Type: {log.targetType}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>

                      {/* Client / IP */}
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3 h-3 shrink-0" />
                          <span>{log.ipAddress || "Unknown IP"}</span>
                        </div>
                      </td>

                      {/* Details button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(log);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Keyset Pagination Load More */}
        {hasMore && !loading && (
          <div className="p-4 border-t border-border flex justify-center bg-muted/10">
            <button
              type="button"
              onClick={() => fetchLogs(false)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-card border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {loadingMore ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>Load More Activity</span>
            </button>
          </div>
        )}
      </div>

      {/* Slide-Over Event Inspection Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card h-full border-l border-border shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Event Inspection</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {selectedEvent.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event Summary Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Timestamp</span>
                <span className="font-medium text-foreground">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Action</span>
                <span className="font-semibold text-foreground">{selectedEvent.action}</span>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Risk Weight</span>
                <span className={`font-bold ${selectedEvent.riskWeight > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                  {selectedEvent.riskWeight} ({selectedEvent.riskWeight > 3 ? "Critical" : selectedEvent.riskWeight > 0 ? "Warning" : "Normal"})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Client IP</span>
                <span className="font-mono text-foreground">{selectedEvent.ipAddress || "Unknown"}</span>
              </div>
            </div>

            {/* Actor Card & Quick 360° Link */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Actor Information</span>
                {selectedEvent.actorId && (
                  <button
                    type="button"
                    onClick={() => {
                      openStudent360({
                        id: selectedEvent.actorId || "",
                        name: selectedEvent.metadata?.actorName,
                        email: selectedEvent.actorEmail,
                      });
                    }}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View 360° History</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">
                  {selectedEvent.metadata?.actorName || selectedEvent.actorEmail}
                </p>
                <p className="text-muted-foreground">{selectedEvent.actorEmail}</p>
                {selectedEvent.metadata?.actorUid && (
                  <p className="text-muted-foreground font-mono">UID / Roll: {selectedEvent.metadata.actorUid}</p>
                )}
              </div>
            </div>

            {/* User Agent */}
            {selectedEvent.userAgent && (
              <div className="space-y-1 text-xs">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">User Agent & Device</span>
                <p className="p-2.5 rounded-lg bg-muted/40 font-mono text-[11px] text-muted-foreground break-all">
                  {selectedEvent.userAgent}
                </p>
              </div>
            )}

            {/* Visual State Diff if present */}
            {selectedEvent.metadata?.diff && (
              <ActivityDiffViewer diff={selectedEvent.metadata.diff} />
            )}

            {/* Sanitized Raw Metadata */}
            <div className="space-y-1 text-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Event Payload Metadata (Sanitized)</span>
              <pre className="p-3 rounded-xl bg-muted/60 font-mono text-[11px] text-foreground overflow-x-auto border border-border/80">
                {JSON.stringify(selectedEvent.metadata, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Student 360° Drawer Modal */}
      {student360 && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-card h-full border-l border-border shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Student 360° Timeline</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {student360.name || student360.email} ({student360.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStudent360(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {student360Loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2">
                <Spinner className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Loading complete journey...</p>
              </div>
            ) : student360Logs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No individual logs found for this student.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {student360Logs.map((l) => (
                    <div key={l.id} className="relative space-y-1">
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-card" />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground">{l.action}</span>
                        <span className="text-muted-foreground font-mono">{formatRelativeTime(l.timestamp)}</span>
                      </div>
                      {l.target && (
                        <p className="text-xs text-muted-foreground">
                          Target: <span className="text-foreground font-medium">{l.target}</span>
                        </p>
                      )}
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2">
                        <span>IP: {l.ipAddress || "—"}</span>
                        {l.riskWeight > 0 && <span className="text-amber-500 font-bold">Risk: {l.riskWeight}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
