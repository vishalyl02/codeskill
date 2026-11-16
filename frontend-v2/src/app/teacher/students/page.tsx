"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GraduationCap,
  Users,
  Search,
  BookOpen,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { facultyAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

export default function TeacherStudentsPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await facultyAPI.getBatches();
      if (res.data?.success) {
        setBatches(res.data.batches || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load assigned batches");
    }
  }, []);

  const fetchStudents = useCallback(async (isSilent = false) => {
    if (!isSilent) setStudentsLoading(true);
    try {
      const res = await facultyAPI.getStudents({
        batchId: selectedBatchId === "all" ? undefined : selectedBatchId,
        search: search.trim() || undefined,
        page,
        limit: 20,
      });
      if (res.data?.success) {
        setStudents(res.data.students || []);
        setTotalPages(res.data.pages || 1);
        setTotalStudents(res.data.total || 0);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load students roster");
    } finally {
      setStudentsLoading(false);
      setLoading(false);
    }
  }, [selectedBatchId, search, page]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 inline-flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> Cohort Rosters
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground mt-2 tracking-tight">
            My Batches & Students
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Access student rosters enrolled strictly across your assigned university cohorts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchBatches();
            fetchStudents();
          }}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${studentsLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Cohorts / Batches Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedBatchId("all");
            setPage(1);
          }}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            selectedBatchId === "all"
              ? "bg-primary/10 border-primary/40 shadow-xs"
              : "bg-card border-border hover:border-border/80 hover:bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">All Cohorts</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground">
              {batches.length} Batches
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Viewing all assigned courses
          </p>
        </button>

        {batches.map((b) => (
          <button
            key={b.assignmentId || b.batchId}
            type="button"
            onClick={() => {
              setSelectedBatchId(b.batchId);
              setPage(1);
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              selectedBatchId === b.batchId
                ? "bg-primary/10 border-primary/40 shadow-xs"
                : "bg-card border-border hover:border-border/80 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground truncate">
                {b.batchName}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-primary/15 text-primary shrink-0">
                {b.studentCount} students
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              <span className="font-semibold text-foreground/80">{b.courseCode}</span>
              {b.section && <span>({b.section})</span>}
              <span>•</span>
              <span>{b.department || "General"}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by student name, roll number, or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={selectedBatchId}
            onChange={(e) => {
              setSelectedBatchId(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-auto bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none cursor-pointer"
          >
            <option value="all">All Assigned Batches</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.batchName} ({b.courseCode}{b.section ? ` - ${b.section}` : ""})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
        {loading || studentsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-bold text-foreground">No Students Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {batches.length === 0
                ? "You do not have any cohort assignments yet. Contact an administrator to link your account to a batch."
                : "No students match your filter or search criteria."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted-foreground">
              <thead className="bg-muted/40 uppercase text-[10px] font-bold text-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-3.5">Student Details</th>
                  <th className="px-6 py-3.5">Roll Number</th>
                  <th className="px-6 py-3.5">Cohort / Batch</th>
                  <th className="px-6 py-3.5">Course & Section</th>
                  <th className="px-6 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((st) => (
                  <tr key={st.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {st.avatar ? (
                            <img src={st.avatar} alt={st.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-bold text-xs text-muted-foreground">
                              {st.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{st.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{st.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 font-mono font-medium text-foreground">
                      {st.rollNumber ? (
                        <span className="px-2 py-0.5 rounded-md bg-muted border border-border">
                          {st.rollNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-medium text-foreground">{st.batchName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {st.department} {st.graduationYear ? `(${st.graduationYear})` : ""}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-foreground font-mono">
                        {st.courseCode || "General"}
                      </div>
                      {st.section && (
                        <div className="text-[11px] text-muted-foreground">
                          Section: {st.section}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <UserCheck className="w-3 h-3" /> Enrolled
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalStudents > 0 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing <span className="font-bold text-foreground">{students.length}</span> of{" "}
              <span className="font-bold text-foreground font-mono">{totalStudents}</span> students
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted text-foreground transition-colors disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono text-xs font-semibold text-foreground">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted text-foreground transition-colors disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
