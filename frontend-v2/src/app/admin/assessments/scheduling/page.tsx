"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  Trash2,
  Upload,
  Download,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  ChevronRight,
  UserCheck,
  UserX,
  PlayCircle,
  History,
  Sparkles,
  Lock,
  Check,
  Edit3,
  BarChart3,
  ArrowUpDown,
  GraduationCap,
  CalendarDays,
  ExternalLink,
} from "lucide-react";
import { examSchedulingAPI, adminAssessmentsAPI } from "@/config/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type TabType =
  | "schedules"
  | "create_edit"
  | "eligibility"
  | "slots"
  | "calendar"
  | "overrides"
  | "attendance"
  | "audit";

export default function AdminExamSchedulingPage() {
  const [activeTab, setActiveTab] = useState<TabType>("schedules");
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [currentSchedule, setCurrentSchedule] = useState<any | null>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form State for Create / Edit Schedule
  const [scheduleForm, setScheduleForm] = useState({
    assessmentId: "",
    title: "",
    code: "",
    academicSession: "2025-2026",
    semester: 5,
    program: "B.E. Computer Science & Engineering",
    academicYear: 3,
    timezone: "Asia/Kolkata",
    maxConcurrentSessions: 500,
    config: {
      earlyAccessMinutes: 10,
      lateStartAllowanceMinutes: 15,
      gracePeriodMinutes: 5,
      allowResumeOnDisconnect: true,
      allowSingleActiveAttempt: true,
      strictSlotBoundary: true,
    },
  });

  // Filter & Search State for Student Eligibility
  const [filterCriteria, setFilterCriteria] = useState({
    academicSession: "",
    semester: "",
    program: "",
    academicYear: "",
    section: "",
    batch: "",
    search: "",
    enrollmentStatus: "active",
  });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [studentList, setStudentList] = useState<any[]>([]);
  const [selectedStudentUids, setSelectedStudentUids] = useState<string[]>([]);
  const [studentsPage, setStudentsPage] = useState<number>(1);
  const [studentsTotalPages, setStudentsTotalPages] = useState<number>(1);
  const [studentsTotalCount, setStudentsTotalCount] = useState<number>(0);

  // CSV & Smart Matching State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvValidationResult, setCsvValidationResult] = useState<any | null>(null);
  const [isCsvUploading, setIsCsvUploading] = useState<boolean>(false);

  // Smart Bulk Import & Auto-Selection State
  const [smartInputMode, setSmartInputMode] = useState<"file" | "paste">("file");
  const [smartFile, setSmartFile] = useState<File | null>(null);
  const [smartPastedText, setSmartPastedText] = useState<string>("");
  const [isSmartMatching, setIsSmartMatching] = useState<boolean>(false);
  const [smartMatchResult, setSmartMatchResult] = useState<any | null>(null);
  const [smartActiveTab, setSmartActiveTab] = useState<"matched" | "unmatched" | "conflicts" | "duplicates">("matched");
  const [smartSearch, setSmartSearch] = useState<string>("");

  // Slots State
  const [slotForm, setSlotForm] = useState({
    name: "",
    slotCode: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "10:30",
    capacity: 300,
    roomOrLab: "Lab 1-A / Online",
  });
  const [autoSlotForm, setAutoSlotForm] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    dailyStartTime: "09:00",
    dailyEndTime: "17:00",
    slotDurationMinutes: 60,
    breakDurationMinutes: 30,
    gapMinutes: 30,
    capacityPerSlot: 300,
    slotPrefix: "Batch Slot",
    strategy: "balanced",
  });
  const [allocationStrategy, setAllocationStrategy] = useState<string>("balanced");

  // Assignments & Overrides State
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState<string>("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<string>("");
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    type: "revoke" | "exception" | "reassign";
    student: any | null;
  }>({ isOpen: false, type: "revoke", student: null });
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [exceptionWindow, setExceptionWindow] = useState({ start: "", end: "" });
  const [targetSlotId, setTargetSlotId] = useState<string>("");

  // Attendance & Audit State
  const [attendanceData, setAttendanceData] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [savedGroups, setSavedGroups] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [groupType, setGroupType] = useState<"filter_dynamic" | "snapshot_fixed">("filter_dynamic");

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Initial Data Fetch
  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [schedulesRes, assessmentsRes] = await Promise.all([
        examSchedulingAPI.getSchedules(),
        adminAssessmentsAPI.getAll(),
      ]);
      const schedList = schedulesRes.data?.schedules || schedulesRes.data || [];
      setSchedules(schedList);
      setAssessments(assessmentsRes.data?.assessments || []);

      if (schedList.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(schedList[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load initial scheduling data:", err);
      showNotification(err.response?.data?.message || "Failed to load schedules", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Fetch Current Selected Schedule Details
  const loadScheduleDetails = async (id: string) => {
    if (!id) return;
    try {
      const res = await examSchedulingAPI.getSchedule(id);
      const sched = res.data;
      setCurrentSchedule(sched);
      if (sched) {
        const sem = Number(sched.semester) || 5;
        const yr = Number(sched.academicYear) || Math.ceil(sem / 2) || 3;
        setScheduleForm({
          assessmentId: sched.assessmentId || "",
          title: sched.title || "",
          code: sched.code || "",
          academicSession: sched.academicSession || "2025-2026",
          semester: sem,
          program: sched.program || "B.E. Computer Science & Engineering",
          academicYear: yr,
          timezone: sched.timezone || "Asia/Kolkata",
          maxConcurrentSessions: sched.maxConcurrentSessions || 500,
          config: {
            earlyAccessMinutes: sched.config?.earlyAccessMinutes ?? 10,
            lateStartAllowanceMinutes: sched.config?.lateStartAllowanceMinutes ?? 15,
            gracePeriodMinutes: sched.config?.gracePeriodMinutes ?? 5,
            allowResumeOnDisconnect: sched.config?.allowResume ?? true,
            allowSingleActiveAttempt: sched.config?.allowedAttempts === 1,
            strictSlotBoundary: sched.config?.strictTimeBoundary ?? true,
          },
        });
      }
    } catch (err) {
      console.error("Failed to load schedule details:", err);
    }
  };

  useEffect(() => {
    if (selectedScheduleId) {
      loadScheduleDetails(selectedScheduleId);
    }
  }, [selectedScheduleId]);

  // Load Assignments when on Eligibility, Overrides, or Attendance tabs
  const loadAssignments = async () => {
    if (!selectedScheduleId) return;
    try {
      const res = await examSchedulingAPI.getAssignments(selectedScheduleId, {
        search: assignmentSearch,
        status: assignmentStatusFilter,
        page: 1,
        limit: 100,
      });
      setAssignments(res.data?.assignments || []);
    } catch (err) {
      console.error("Failed to load assignments:", err);
    }
  };

  // Load Attendance
  const loadAttendance = async () => {
    if (!selectedScheduleId) return;
    try {
      const res = await examSchedulingAPI.getAttendance(selectedScheduleId);
      const raw = res.data?.data || res.data || null;
      setAttendanceData(raw);
    } catch (err) {
      console.error("Failed to load attendance:", err);
    }
  };

  // Load Audit Logs
  const loadAuditLogs = async () => {
    try {
      const res = await examSchedulingAPI.getAuditLogs({ scheduleId: selectedScheduleId, limit: 100 });
      setAuditLogs(res.data?.logs || []);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    }
  };

  // Load Saved Groups
  const loadSavedGroups = async () => {
    try {
      const res = await examSchedulingAPI.getSavedGroups();
      setSavedGroups(res.data?.groups || []);
    } catch (err) {
      console.error("Failed to load saved groups:", err);
    }
  };

  useEffect(() => {
    if (!selectedScheduleId) return;
    if (activeTab === "eligibility" || activeTab === "overrides") {
      loadAssignments();
    } else if (activeTab === "attendance") {
      loadAttendance();
    } else if (activeTab === "audit") {
      loadAuditLogs();
    }
  }, [activeTab, selectedScheduleId, assignmentSearch, assignmentStatusFilter]);

  // Handle Live Count Preview for Student Filters
  const handlePreviewCount = async () => {
    setPreviewLoading(true);
    try {
      const res = await examSchedulingAPI.previewStudentCount(filterCriteria);
      setPreviewCount(res.data.count);
    } catch (err) {
      console.error("Failed to preview count:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Search Students for Manual Selection Table
  const handleSearchStudents = async (page = 1) => {
    try {
      const res = await examSchedulingAPI.searchStudents(filterCriteria, page, 20);
      const data = res.data?.data || res.data || {};
      const students = data.students || (Array.isArray(data) ? data : []);
      setStudentList(students);
      const currPage = data.pagination?.page ?? data.page ?? page ?? 1;
      const totalCount = data.pagination?.total ?? data.total ?? students.length ?? 0;
      const totalPages = data.pagination?.totalPages ?? data.totalPages ?? Math.ceil(totalCount / 20) ?? 1;
      setStudentsPage(currPage);
      setStudentsTotalPages(totalPages);
      setStudentsTotalCount(totalCount);
    } catch (err) {
      console.error("Failed to search students:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "eligibility") {
      handleSearchStudents(1);
      loadSavedGroups();
    }
  }, [activeTab]);

  // Schedule Actions
  const handleCreateOrUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        ...scheduleForm,
        semester: Number(scheduleForm.semester) || 5,
        academicYear: Number(scheduleForm.academicYear) || Math.ceil((Number(scheduleForm.semester) || 5) / 2) || 3,
      };
      if (selectedScheduleId && activeTab === "create_edit" && currentSchedule?.id === selectedScheduleId) {
        await examSchedulingAPI.updateSchedule(selectedScheduleId, payload);
        showNotification("Schedule successfully updated!");
      } else {
        const res = await examSchedulingAPI.createSchedule(payload);
        showNotification("Exam schedule created in Draft state!");
        setSelectedScheduleId(res.data.id);
      }
      await loadInitialData();
      setActiveTab("slots");
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to save schedule", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublishSchedule = async () => {
    if (!selectedScheduleId) return;
    if (!confirm("Are you sure you want to PUBLISH this exam schedule? Once published, student eligibility is locked and authoritative time enforcement is activated.")) {
      return;
    }
    setActionLoading(true);
    try {
      await examSchedulingAPI.publishSchedule(selectedScheduleId);
      showNotification("Schedule successfully published! Students can now access according to their assigned slots.");
      loadScheduleDetails(selectedScheduleId);
      loadInitialData();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to publish schedule", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!selectedScheduleId) return;
    const reason = prompt("Enter a mandatory reason for cancelling this schedule:");
    if (!reason) return;
    setActionLoading(true);
    try {
      await examSchedulingAPI.cancelSchedule(selectedScheduleId, reason);
      showNotification("Schedule cancelled successfully.");
      loadScheduleDetails(selectedScheduleId);
      loadInitialData();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to cancel schedule", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Slot Actions
  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScheduleId) return;
    setActionLoading(true);
    try {
      await examSchedulingAPI.createSlot(selectedScheduleId, slotForm);
      showNotification("Exam slot created successfully!");
      setSlotForm({
        name: "",
        slotCode: "",
        date: new Date().toISOString().split("T")[0],
        startTime: "09:00",
        endTime: "10:30",
        capacity: 300,
        roomOrLab: "Lab 1-A / Online",
      });
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to create slot", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoGenerateSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScheduleId) return;
    setActionLoading(true);
    try {
      const d1 = new Date(autoSlotForm.startDate);
      const d2 = new Date(autoSlotForm.endDate);
      const diffMs = d2.getTime() - d1.getTime();
      const calculatedDays = Math.max(1, Math.min(14, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1));

      const [startH, startM] = (autoSlotForm.dailyStartTime || "09:00").split(":").map(Number);
      const [endH, endM] = (autoSlotForm.dailyEndTime || "17:00").split(":").map(Number);
      const startMin = (startH || 9) * 60 + (startM || 0);
      const endMin = (endH || 17) * 60 + (endM || 0);
      const duration = Number(autoSlotForm.slotDurationMinutes) || 60;
      const gap = Number(autoSlotForm.gapMinutes ?? autoSlotForm.breakDurationMinutes ?? 30);
      const available = Math.max(0, endMin - startMin);
      const calculatedSlots = Math.max(1, Math.min(10, Math.floor((available + gap) / (duration + gap)) || 4));

      const payload = {
        startDate: autoSlotForm.startDate,
        endDate: autoSlotForm.endDate,
        dailyStartTime: autoSlotForm.dailyStartTime,
        dailyEndTime: autoSlotForm.dailyEndTime,
        slotDurationMinutes: duration,
        gapMinutes: gap,
        breakDurationMinutes: gap,
        capacityPerSlot: Number(autoSlotForm.capacityPerSlot) || 300,
        slotsPerDay: calculatedSlots,
        totalDays: calculatedDays,
        namePrefix: autoSlotForm.slotPrefix || "Batch Slot",
        slotPrefix: autoSlotForm.slotPrefix || "Batch Slot",
      };

      const res = await examSchedulingAPI.autoGenerateSlots(selectedScheduleId, payload);
      showNotification(`Generated ${res.data?.length || res.data?.count || "exam"} slots successfully!`);
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to auto-generate slots", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Are you sure you want to delete this slot? Any assigned students will become unallocated.")) return;
    try {
      await examSchedulingAPI.deleteSlot(selectedScheduleId, slotId);
      showNotification("Slot deleted.");
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to delete slot", "error");
    }
  };

  // Bulk Student Assignment Actions
  const handleAssignFilteredStudents = async () => {
    if (!selectedScheduleId) return;
    if (!confirm(`Assign all students matching current filters to schedule "${currentSchedule?.title}"?`)) return;
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkAssign(selectedScheduleId, {
        selectionType: "filter",
        filterCriteria,
      });
      showNotification(`Successfully assigned ${res.data.assigned} students!`);
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to assign students", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSelectedManualStudents = async () => {
    if (!selectedScheduleId || selectedStudentUids.length === 0) return;
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkAssign(selectedScheduleId, {
        selectionType: "manual",
        studentUids: selectedStudentUids,
      });
      showNotification(`Assigned ${res.data.assigned} selected students!`);
      setSelectedStudentUids([]);
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to assign students", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!selectedScheduleId || !csvFile) return;
    setIsCsvUploading(true);
    try {
      const res = await examSchedulingAPI.importCsv(selectedScheduleId, csvFile);
      setCsvValidationResult(res.data);
      showNotification("CSV parsed and validated! Review the summary below.");
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to parse CSV", "error");
    } finally {
      setIsCsvUploading(false);
    }
  };

  const handleCommitCsvAssignment = async () => {
    if (!selectedScheduleId || !csvValidationResult?.matchedStudents?.length) return;
    const uids = csvValidationResult.matchedStudents.map((s: any) => s.studentUid);
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkAssign(selectedScheduleId, {
        selectionType: "csv",
        studentUids: uids,
      });
      showNotification(`Committed ${res.data.assigned} students from CSV!`);
      setCsvValidationResult(null);
      setCsvFile(null);
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to commit CSV assignments", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Smart Bulk Matching Handlers
  const handleProcessSmartMatching = async () => {
    if (!selectedScheduleId) {
      showNotification("Please select an exam schedule first", "error");
      return;
    }
    if (smartInputMode === "file" && !smartFile) {
      showNotification("Please select a CSV or Excel (.xlsx) file first", "error");
      return;
    }
    if (smartInputMode === "paste" && !smartPastedText.trim()) {
      showNotification("Please paste student identifiers (UIDs or emails) into the text box", "error");
      return;
    }

    setIsSmartMatching(true);
    try {
      const res = await examSchedulingAPI.matchIdentifiers(selectedScheduleId, {
        file: smartInputMode === "file" ? smartFile : null,
        rawText: smartInputMode === "paste" ? smartPastedText : undefined,
      });
      setSmartMatchResult(res.data);
      showNotification(
        `Successfully processed ${res.data.summary.totalInputRows} rows! Matched ${res.data.summary.matchedStudentsCount} students.`
      );
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to match student identifiers", "error");
    } finally {
      setIsSmartMatching(false);
    }
  };

  const handleAutoSelectAllMatched = () => {
    if (!smartMatchResult?.matchedStudents?.length) return;
    const matchedUids = smartMatchResult.matchedStudents.map((s: any) => s.uid);
    const newUids = Array.from(new Set([...selectedStudentUids, ...matchedUids]));
    setSelectedStudentUids(newUids);
    showNotification(`Merged ${matchedUids.length} matched students into active selection (Total selected: ${newUids.length})`);
  };

  const handleReplaceSelectionWithMatched = () => {
    if (!smartMatchResult?.matchedStudents?.length) return;
    if (
      !confirm(
        `Replace current selection (${selectedStudentUids.length} students) with the ${smartMatchResult.matchedStudents.length} matched students from this import?`
      )
    ) {
      return;
    }
    const matchedUids = smartMatchResult.matchedStudents.map((s: any) => s.uid);
    setSelectedStudentUids(matchedUids);
    showNotification(`Active selection updated to ${matchedUids.length} students from import.`);
  };

  const handleDownloadErrorReport = async () => {
    if (!selectedScheduleId || !smartMatchResult) return;
    try {
      const res = await examSchedulingAPI.exportMatchErrors(selectedScheduleId, {
        unmatchedRecords: smartMatchResult.unmatchedRecords || [],
        conflictingRecords: smartMatchResult.conflictingRecords || [],
        duplicateRecords: smartMatchResult.duplicateRecords || [],
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `import-errors-${selectedScheduleId}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download error report:", err);
      showNotification("Failed to download error report", "error");
    }
  };

  const handleDirectCommitMatched = async () => {
    if (!selectedScheduleId || !smartMatchResult?.matchedStudents?.length) return;
    const studentUids = smartMatchResult.matchedStudents.map((s: any) => s.uid);
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkAssign(selectedScheduleId, {
        selectionType: "manual",
        studentUids,
      });
      showNotification(`Committed & assigned ${res.data.assigned} matched students to schedule!`);
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to commit matched students", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Student Slot Allocation Actions
  const handleAllocateSlots = async () => {
    if (!selectedScheduleId) return;
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.allocateSlots(selectedScheduleId, {
        strategy: allocationStrategy,
      });
      showNotification(`Successfully allocated ${res.data.allocated} students across slots using ${allocationStrategy} distribution!`);
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to allocate slots", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Access Override Actions
  const handleConfirmOverride = async () => {
    if (!selectedScheduleId || !overrideModal.student) return;
    if (!overrideReason.trim()) {
      alert("A documented reason is mandatory for exceptional access control.");
      return;
    }
    setActionLoading(true);
    try {
      const assignmentId = overrideModal.student.id || overrideModal.student.assignmentId;
      const studentId = overrideModal.student.studentId || overrideModal.student.id;

      if (overrideModal.type === "revoke") {
        await examSchedulingAPI.revokeAccess(selectedScheduleId, {
          assignmentIds: assignmentId ? [assignmentId] : undefined,
          assignmentId: assignmentId || studentId,
          studentId,
          reason: overrideReason,
        });
        showNotification(`Revoked exam access for student ${overrideModal.student.studentUid}`);
      } else if (overrideModal.type === "exception") {
        await examSchedulingAPI.grantException(selectedScheduleId, {
          assignmentId: assignmentId || studentId,
          studentId,
          reason: overrideReason,
          newAccessWindowStart: exceptionWindow.start || undefined,
          newAccessWindowEnd: exceptionWindow.end || undefined,
        });
        showNotification(`Granted exceptional access for student ${overrideModal.student.studentUid}`);
      } else if (overrideModal.type === "reassign") {
        await examSchedulingAPI.reassignSlot(selectedScheduleId, {
          assignmentId: assignmentId || studentId,
          studentId,
          targetSlotId,
          reason: overrideReason,
        });
        showNotification(`Reassigned student ${overrideModal.student.studentUid} to target slot`);
      }
      setOverrideModal({ isOpen: false, type: "revoke", student: null });
      setOverrideReason("");
      loadAssignments();
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to execute override", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinstate = async (assignmentIdOrStudentId: string, studentUid: string, fallbackStudentId?: string) => {
    const reason = prompt(`Reason for reinstating access for student ${studentUid}:`);
    if (!reason) return;
    try {
      await examSchedulingAPI.reinstateAccess(selectedScheduleId, {
        assignmentId: assignmentIdOrStudentId,
        studentId: fallbackStudentId || assignmentIdOrStudentId,
        reason,
      });
      showNotification(`Reinstated access for student ${studentUid}`);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to reinstate access", "error");
    }
  };

  // Save Group Action
  const handleSaveCurrentGroup = async () => {
    if (!newGroupName.trim()) {
      alert("Please enter a name for this student group");
      return;
    }
    try {
      await examSchedulingAPI.createSavedGroup({
        name: newGroupName,
        groupType,
        filterCriteria: groupType === "filter_dynamic" ? filterCriteria : undefined,
        studentIds: groupType === "snapshot_fixed" ? selectedStudentUids : undefined,
      });
      showNotification(`Saved group "${newGroupName}" successfully!`);
      setNewGroupName("");
      loadSavedGroups();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to save group", "error");
    }
  };

  // Calculated Stats
  const totalSlotsCapacity = useMemo(() => {
    return currentSchedule?.slots?.reduce((sum: number, s: any) => sum + (s.capacity || 0), 0) || 0;
  }, [currentSchedule]);

  const totalAssignedInSlots = useMemo(() => {
    return currentSchedule?.slots?.reduce((sum: number, s: any) => sum + (s.assignedCount || 0), 0) || 0;
  }, [currentSchedule]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          role="alert"
          className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-xl border flex items-center gap-3 transition-all animate-in slide-in-from-top-3 ${
            notification.type === "success"
              ? "bg-emerald-950/90 text-emerald-200 border-emerald-800"
              : "bg-rose-950/90 text-rose-200 border-rose-800"
          }`}
        >
          {notification.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            <GraduationCap className="w-4 h-4" /> Department of Skill Development &bull; Enterprise Exam Scheduling
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Exam Scheduling &amp; Student Eligibility</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Granular administrative control over student eligibility, multi-slot batch allocations, capacity constraints, and authoritative server-side gatekeeping.
          </p>
        </div>

        {/* Global Schedule Selector & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedScheduleId}
            onChange={(e) => setSelectedScheduleId(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-card border border-border text-sm font-medium shadow-xs focus:ring-2 focus:ring-primary outline-hidden"
          >
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.code}) - {s.status.toUpperCase()}
              </option>
            ))}
            {schedules.length === 0 && <option value="">No Schedules Found</option>}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedScheduleId("");
              setCurrentSchedule(null);
              setScheduleForm({
                assessmentId: "",
                title: "",
                code: "",
                academicSession: "2025-2026",
                semester: 5,
                program: "B.E. Computer Science & Engineering",
                academicYear: 3,
                timezone: "Asia/Kolkata",
                maxConcurrentSessions: 500,
                config: {
                  earlyAccessMinutes: 10,
                  lateStartAllowanceMinutes: 15,
                  gracePeriodMinutes: 5,
                  allowResumeOnDisconnect: true,
                  allowSingleActiveAttempt: true,
                  strictSlotBoundary: true,
                },
              });
              setActiveTab("create_edit");
            }}
            className="flex items-center gap-1.5 rounded-xl"
          >
            <Plus className="w-4 h-4" /> New Schedule
          </Button>

          {currentSchedule && currentSchedule.status === "draft" && (
            <Button
              onClick={handlePublishSchedule}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-4 h-4" /> Publish Schedule
            </Button>
          )}

          {currentSchedule && currentSchedule.status === "published" && (
            <Button
              variant="outline"
              onClick={handleCancelSchedule}
              disabled={actionLoading}
              className="text-rose-500 hover:text-rose-600 border-rose-500/30 rounded-xl flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" /> Cancel Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Active Schedule Quick Info Bar */}
      {currentSchedule && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{currentSchedule.title}</h2>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase border ${
                    currentSchedule.status === "published"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      : currentSchedule.status === "draft"
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                  }`}
                >
                  {currentSchedule.status}
                </span>
                <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                  {currentSchedule.code}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentSchedule.program} &bull; {currentSchedule.semester} ({currentSchedule.academicSession}) &bull; {currentSchedule.timezone}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Eligible Students</p>
              <p className="font-bold text-base">{currentSchedule.totalEligibleStudents || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Slots Configured</p>
              <p className="font-bold text-base">{currentSchedule.slots?.length || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Slot Capacity</p>
              <p className="font-bold text-base">
                {totalAssignedInSlots} / {totalSlotsCapacity}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unallocated</p>
              <p className="font-bold text-base text-amber-500">
                {Math.max(0, (currentSchedule.totalEligibleStudents || 0) - totalAssignedInSlots)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 8 Main Tabs Navigation */}
      <div className="border-b border-border overflow-x-auto">
        <nav className="flex space-x-1 min-w-max pb-1">
          {[
            { id: "schedules", label: "Exam Schedules", icon: Layers },
            { id: "create_edit", label: currentSchedule ? "Edit Schedule" : "Create Schedule", icon: Settings2 },
            { id: "eligibility", label: "Student Eligibility & Selection", icon: Users },
            { id: "slots", label: "Batch & Slot Management", icon: Clock },
            { id: "calendar", label: "Calendar & Timetable", icon: Calendar },
            { id: "overrides", label: "Access Overrides & Exceptions", icon: ShieldAlert },
            { id: "attendance", label: "Attendance & Attempts", icon: BarChart3 },
            { id: "audit", label: "Audit Logs", icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: ALL EXAM SCHEDULES */}
      {activeTab === "schedules" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Configured Exam Schedules</h2>
            <Button
              onClick={() => {
                setSelectedScheduleId("");
                setCurrentSchedule(null);
                setActiveTab("create_edit");
              }}
              className="rounded-xl flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create New Schedule
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {schedules.map((schedule) => {
              const capacity = schedule.slots?.reduce((sum: number, s: any) => sum + s.capacity, 0) || 0;
              const assigned = schedule.slots?.reduce((sum: number, s: any) => sum + s.assignedCount, 0) || 0;
              const isSelected = schedule.id === selectedScheduleId;

              return (
                <div
                  key={schedule.id}
                  className={`bg-card border rounded-2xl p-5 shadow-xs transition-all relative flex flex-col justify-between ${
                    isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                          schedule.status === "published"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : schedule.status === "draft"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        }`}
                      >
                        {schedule.status}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{schedule.code}</span>
                    </div>

                    <h3 className="font-bold text-lg leading-snug">{schedule.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {schedule.program} &bull; {schedule.semester}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border/50">
                      <div>
                        <span className="text-muted-foreground">Eligible Students:</span>
                        <p className="font-semibold">{schedule.totalEligibleStudents || 0}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Slots Count:</span>
                        <p className="font-semibold">{schedule.slots?.length || 0}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Slot Capacity:</span>
                        <p className="font-semibold">{capacity}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Assigned:</span>
                        <p className="font-semibold">{assigned}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedScheduleId(schedule.id);
                        setActiveTab("slots");
                      }}
                      className="w-full rounded-xl text-xs"
                    >
                      {isSelected ? "Active &bull; Open Slots" : "Select &amp; Manage"}
                    </Button>
                    <Link href={`/admin/assessments/${schedule.assessmentId}`}>
                      <Button variant="ghost" size="sm" className="rounded-xl px-2 text-muted-foreground" title="View Assessment">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CREATE / EDIT SCHEDULE FORM */}
      {activeTab === "create_edit" && (
        <form onSubmit={handleCreateOrUpdateSchedule} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs max-w-4xl mx-auto">
          <div className="border-b border-border pb-4">
            <h2 className="text-xl font-bold">
              {currentSchedule ? `Edit Schedule: ${currentSchedule.title}` : "Create New Exam Schedule"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure academic scope, concurrent capacity limits, and authoritative access boundaries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Target Assessment *
              </label>
              <select
                required
                value={scheduleForm.assessmentId}
                onChange={(e) => {
                  const aId = e.target.value;
                  const found = assessments.find((a) => a.id === aId || a._id === aId);
                  if (found) {
                    let semNum = 5;
                    if (found.targetSemesters && found.targetSemesters.length > 0) {
                      const extracted = parseInt(String(found.targetSemesters[0]).replace(/\D/g, ""), 10);
                      if (!isNaN(extracted) && extracted > 0) {
                        semNum = extracted;
                      }
                    }
                    const acadYear = Math.ceil(semNum / 2) || 3;
                    const session = (found.targetBatches && found.targetBatches.length > 0 && found.targetBatches[0])
                      ? (found.targetBatches[0].includes("-") ? found.targetBatches[0] : `${found.targetBatches[0]}-${parseInt(found.targetBatches[0], 10) + 1 || "2026"}`)
                      : "2025-2026";
                    const prog = (found.targetCourses && found.targetCourses.length > 0 ? found.targetCourses[0] : null)
                      || (found.targetDepartments && found.targetDepartments.length > 0 ? found.targetDepartments[0] : null)
                      || "B.E. Computer Science & Engineering";

                    setScheduleForm({
                      ...scheduleForm,
                      assessmentId: aId,
                      title: `${found.title} - Scheduled Exam`,
                      code: found.code ? `${found.code}-SCHED` : scheduleForm.code,
                      academicSession: session,
                      semester: semNum,
                      academicYear: acadYear,
                      program: prog,
                    });
                  } else {
                    setScheduleForm({
                      ...scheduleForm,
                      assessmentId: aId,
                    });
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              >
                <option value="">-- Select an Assessment --</option>
                {assessments.map((a) => (
                  <option key={a.id || a._id} value={a.id || a._id}>
                    {a.title} ({a.code || "No Code"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Schedule Code (Unique) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CSE-MID-2025"
                value={scheduleForm.code}
                onChange={(e) => setScheduleForm({ ...scheduleForm, code: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Schedule Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Semester 5 Mid-Term DSA Examination"
                value={scheduleForm.title}
                onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Academic Session
              </label>
              <input
                type="text"
                placeholder="e.g. 2025-2026"
                value={scheduleForm.academicSession}
                onChange={(e) => setScheduleForm({ ...scheduleForm, academicSession: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Semester
              </label>
              <input
                type="number"
                min="1"
                max="12"
                placeholder="e.g. 5"
                value={scheduleForm.semester}
                onChange={(e) => {
                  const s = parseInt(e.target.value, 10) || 1;
                  setScheduleForm({
                    ...scheduleForm,
                    semester: s,
                    academicYear: Math.ceil(s / 2) || 1,
                  });
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                Semester {scheduleForm.semester} (Year {scheduleForm.academicYear || Math.ceil(Number(scheduleForm.semester) / 2)})
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Academic Year
              </label>
              <input
                type="number"
                min="1"
                max="6"
                placeholder="e.g. 3"
                value={scheduleForm.academicYear}
                onChange={(e) => setScheduleForm({ ...scheduleForm, academicYear: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                Calculated Year of Study (e.g. 3 for Semester 5)
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Program / Department
              </label>
              <input
                type="text"
                placeholder="e.g. B.E. Computer Science & Engineering"
                value={scheduleForm.program}
                onChange={(e) => setScheduleForm({ ...scheduleForm, program: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Max Concurrent Active Sessions
              </label>
              <input
                type="number"
                min="10"
                max="5000"
                value={scheduleForm.maxConcurrentSessions}
                onChange={(e) => setScheduleForm({ ...scheduleForm, maxConcurrentSessions: parseInt(e.target.value) || 500 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Safeguards backend infrastructure against simultaneous spikes.
              </p>
            </div>
          </div>

          {/* Access Rules Configuration */}
          <div className="pt-4 border-t border-border space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Authoritative Access Rules &amp; Time Windows
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Early Access Allowance (min)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={scheduleForm.config.earlyAccessMinutes}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      config: { ...scheduleForm.config, earlyAccessMinutes: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Late Start Limit (min)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={scheduleForm.config.lateStartAllowanceMinutes}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      config: { ...scheduleForm.config, lateStartAllowanceMinutes: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Submission Grace Period (min)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={scheduleForm.config.gracePeriodMinutes}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      config: { ...scheduleForm.config, gracePeriodMinutes: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleForm.config.allowResumeOnDisconnect}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      config: { ...scheduleForm.config, allowResumeOnDisconnect: e.target.checked },
                    })
                  }
                  className="w-4 h-4 rounded text-primary"
                />
                <span className="text-sm">Allow students to resume within their allotted slot if disconnected</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleForm.config.strictSlotBoundary}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      config: { ...scheduleForm.config, strictSlotBoundary: e.target.checked },
                    })
                  }
                  className="w-4 h-4 rounded text-primary"
                />
                <span className="text-sm">
                  Enforce strict slot boundary (late starters do not get duration extended past slot end + grace period)
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setActiveTab("schedules")} className="rounded-xl">
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading} className="rounded-xl">
              {actionLoading ? <Spinner /> : currentSchedule ? "Save Changes" : "Create Schedule (Draft)"}
            </Button>
          </div>
        </form>
      )}

      {/* TAB 3: STUDENT ELIGIBILITY & SELECTION */}
      {activeTab === "eligibility" && (
        <div className="space-y-6">
          {!currentSchedule ? (
            <div className="p-8 text-center border border-dashed rounded-2xl text-muted-foreground">
              Please select or create an exam schedule first.
            </div>
          ) : (
            <>
              {/* Filter-Based Selection Section */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Filter className="w-5 h-5 text-primary" /> Filter-Based Population Targeting
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Target thousands of students dynamically across academic sessions, semesters, sections, and groups.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviewCount}
                    disabled={previewLoading}
                    className="rounded-xl flex items-center gap-1.5 text-xs"
                  >
                    {previewLoading ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Check Live Count
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Academic Session</label>
                    <input
                      type="text"
                      placeholder="e.g. 2025-2026"
                      value={filterCriteria.academicSession}
                      onChange={(e) => setFilterCriteria({ ...filterCriteria, academicSession: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Semester</label>
                    <input
                      type="text"
                      placeholder="e.g. Semester 5"
                      value={filterCriteria.semester}
                      onChange={(e) => setFilterCriteria({ ...filterCriteria, semester: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Program / Course</label>
                    <input
                      type="text"
                      placeholder="e.g. B.E. CSE"
                      value={filterCriteria.program}
                      onChange={(e) => setFilterCriteria({ ...filterCriteria, program: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Section</label>
                    <input
                      type="text"
                      placeholder="e.g. A1, A2, B1"
                      value={filterCriteria.section}
                      onChange={(e) => setFilterCriteria({ ...filterCriteria, section: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                    />
                  </div>
                </div>

                {previewCount !== null && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      <div>
                        <span className="font-bold text-base text-foreground">{previewCount}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">
                          students matched across the entire database
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={handleAssignFilteredStudents}
                      disabled={actionLoading || previewCount === 0}
                      className="rounded-xl text-xs flex items-center gap-1.5"
                    >
                      <UserCheck className="w-4 h-4" />
                      Assign All {previewCount} Matching Students to Schedule
                    </Button>
                  </div>
                )}
              </div>

              {/* Smart Bulk Student Selection by UID or Email (CSV, Excel, Paste) */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" /> Smart Bulk Student Matching &amp; Auto-Selection
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Upload CSV, Excel (.xlsx), or paste student UIDs/emails copied directly from spreadsheets. Automatically matches existing records, detects duplicates &amp; cross-identifier conflicts, and auto-selects candidates.
                    </p>
                  </div>

                  {/* Input Mode Selector */}
                  <div className="flex bg-muted p-1 rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSmartInputMode("file")}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        smartInputMode === "file"
                          ? "bg-background text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload File (CSV / XLSX)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmartInputMode("paste")}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        smartInputMode === "paste"
                          ? "bg-background text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Direct Paste (Text / Excel)
                    </button>
                  </div>
                </div>

                {/* Input Controls */}
                {smartInputMode === "file" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls,.txt"
                        onChange={(e) => setSmartFile(e.target.files?.[0] || null)}
                        className="text-xs file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                      />
                      <Button
                        onClick={handleProcessSmartMatching}
                        disabled={!smartFile || isSmartMatching}
                        className="rounded-xl text-xs flex items-center gap-1.5"
                      >
                        {isSmartMatching ? <Spinner /> : <Sparkles className="w-4 h-4" />}
                        Process &amp; Match Identifiers
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Supported formats: <strong>.csv, .xlsx, .xls, .txt</strong>. Accepts headers such as <code>UID</code>, <code>Email</code>, <code>StudentUID</code>, <code>StudentEmail</code>, or raw columns without headers.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      rows={5}
                      value={smartPastedText}
                      onChange={(e) => setSmartPastedText(e.target.value)}
                      placeholder="Paste student UIDs or emails here (one per line, comma-separated, or copied directly as tab-separated columns from Excel/Google Sheets)...&#10;&#10;Examples:&#10;25BCS10158&#10;25BCS10410, student2@example.com&#10;student3@example.com"
                      className="w-full p-3 rounded-xl bg-background border border-border text-xs font-mono focus:ring-2 focus:ring-primary outline-hidden"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        Supports newline, tab, comma, and semicolon separated identifiers. Auto-detects UIDs and emails.
                      </p>
                      <Button
                        onClick={handleProcessSmartMatching}
                        disabled={!smartPastedText.trim() || isSmartMatching}
                        className="rounded-xl text-xs flex items-center gap-1.5"
                      >
                        {isSmartMatching ? <Spinner /> : <Sparkles className="w-4 h-4" />}
                        Process &amp; Match Identifiers
                      </Button>
                    </div>
                  </div>
                )}

                {/* Match Results & Preview */}
                {smartMatchResult && (
                  <div className="bg-muted/40 border border-border rounded-2xl p-5 space-y-4 animate-in fade-in-50">
                    {/* Summary Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Total Rows</span>
                        <p className="font-extrabold text-lg mt-0.5">{smartMatchResult.summary.totalInputRows}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">Unique IDs</span>
                        <p className="font-extrabold text-lg mt-0.5">{smartMatchResult.summary.uniqueIdentifiersProcessed}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-emerald-500">Matched Students</span>
                        <p className="font-extrabold text-lg mt-0.5 text-emerald-500">{smartMatchResult.summary.matchedStudentsCount}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-blue-500">Already Assigned</span>
                        <p className="font-extrabold text-lg mt-0.5 text-blue-500">{smartMatchResult.summary.alreadyAssignedCount}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-amber-500">Duplicates In File</span>
                        <p className="font-extrabold text-lg mt-0.5 text-amber-500">{smartMatchResult.summary.duplicateEntriesCount}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-rose-500">Unmatched</span>
                        <p className="font-extrabold text-lg mt-0.5 text-rose-500">{smartMatchResult.summary.unmatchedCount}</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-purple-500">Conflicts</span>
                        <p className="font-extrabold text-lg mt-0.5 text-purple-500">{smartMatchResult.summary.conflictCount}</p>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          onClick={handleAutoSelectAllMatched}
                          disabled={!smartMatchResult.matchedStudents.length}
                          className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
                        >
                          <UserCheck className="w-3.5 h-3.5" /> Auto-Select All Matched ({smartMatchResult.matchedStudents.length})
                        </Button>

                        <Button
                          variant="outline"
                          onClick={handleReplaceSelectionWithMatched}
                          disabled={!smartMatchResult.matchedStudents.length}
                          className="rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Replace Current Selection
                        </Button>

                        {(smartMatchResult.summary.unmatchedCount > 0 || smartMatchResult.summary.conflictCount > 0 || smartMatchResult.summary.duplicateEntriesCount > 0) && (
                          <Button
                            variant="outline"
                            onClick={handleDownloadErrorReport}
                            className="rounded-xl text-xs text-rose-500 hover:text-rose-600 border-rose-500/30 flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Error Report (CSV)
                          </Button>
                        )}
                      </div>

                      <Button
                        onClick={handleDirectCommitMatched}
                        disabled={actionLoading || !smartMatchResult.matchedStudents.length}
                        className="rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Assign Matched Directly to Schedule
                      </Button>
                    </div>

                    {/* Sub-Tabs for Breakdown */}
                    <div className="pt-2">
                      <div className="flex border-b border-border text-xs font-medium space-x-2 pb-2">
                        <button
                          type="button"
                          onClick={() => setSmartActiveTab("matched")}
                          className={`px-3 py-1.5 rounded-lg ${
                            smartActiveTab === "matched" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          Matched Students ({smartMatchResult.matchedStudents.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSmartActiveTab("unmatched")}
                          className={`px-3 py-1.5 rounded-lg ${
                            smartActiveTab === "unmatched" ? "bg-rose-500 text-white font-semibold" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          Unmatched Records ({smartMatchResult.unmatchedRecords.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSmartActiveTab("conflicts")}
                          className={`px-3 py-1.5 rounded-lg ${
                            smartActiveTab === "conflicts" ? "bg-purple-600 text-white font-semibold" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          Conflicts ({smartMatchResult.conflictingRecords.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSmartActiveTab("duplicates")}
                          className={`px-3 py-1.5 rounded-lg ${
                            smartActiveTab === "duplicates" ? "bg-amber-500 text-white font-semibold" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          Duplicates in Input ({smartMatchResult.duplicateRecords.length})
                        </button>
                      </div>

                      {/* Sub-Tab 1: Matched Students */}
                      {smartActiveTab === "matched" && (
                        <div className="mt-3 overflow-x-auto max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-card text-muted-foreground uppercase font-semibold sticky top-0">
                              <tr>
                                <th className="p-2 w-10">Select</th>
                                <th className="p-2">UID</th>
                                <th className="p-2">Name</th>
                                <th className="p-2">Email</th>
                                <th className="p-2">Department</th>
                                <th className="p-2">Semester</th>
                                <th className="p-2">Section</th>
                                <th className="p-2">Schedule Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {smartMatchResult.matchedStudents.map((s: any) => {
                                const isChecked = selectedStudentUids.includes(s.uid);
                                return (
                                  <tr key={s.studentId} className="hover:bg-card/50">
                                    <td className="p-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedStudentUids([...selectedStudentUids, s.uid]);
                                          } else {
                                            setSelectedStudentUids(selectedStudentUids.filter((u) => u !== s.uid));
                                          }
                                        }}
                                        className="w-4 h-4 rounded text-primary"
                                      />
                                    </td>
                                    <td className="p-2 font-mono font-semibold">{s.uid}</td>
                                    <td className="p-2 font-medium">{s.name}</td>
                                    <td className="p-2 text-muted-foreground">{s.email}</td>
                                    <td className="p-2">{s.department || "-"}</td>
                                    <td className="p-2">{s.semester ? `Sem ${s.semester}` : "-"}</td>
                                    <td className="p-2 font-mono">{s.section || "-"}</td>
                                    <td className="p-2">
                                      {s.alreadyAssigned ? (
                                        <span className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded">
                                          {s.assignedSlotName ? `Assigned (${s.assignedSlotName})` : "Already Assigned"}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                                          New Candidate
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Sub-Tab 2: Unmatched Records */}
                      {smartActiveTab === "unmatched" && (
                        <div className="mt-3 overflow-x-auto max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-card text-muted-foreground uppercase font-semibold sticky top-0">
                              <tr>
                                <th className="p-2 w-16">Row #</th>
                                <th className="p-2">Input UID</th>
                                <th className="p-2">Input Email</th>
                                <th className="p-2">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {smartMatchResult.unmatchedRecords.map((u: any, idx: number) => (
                                <tr key={idx} className="hover:bg-card/50 text-rose-500">
                                  <td className="p-2 font-mono">{u.rowNumber}</td>
                                  <td className="p-2 font-mono">{u.inputUid || "-"}</td>
                                  <td className="p-2">{u.inputEmail || "-"}</td>
                                  <td className="p-2">{u.reason}</td>
                                </tr>
                              ))}
                              {smartMatchResult.unmatchedRecords.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                    No unmatched records! All identifiers matched database accounts.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Sub-Tab 3: Conflicts */}
                      {smartActiveTab === "conflicts" && (
                        <div className="mt-3 overflow-x-auto max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-card text-muted-foreground uppercase font-semibold sticky top-0">
                              <tr>
                                <th className="p-2 w-16">Row #</th>
                                <th className="p-2">Input UID</th>
                                <th className="p-2">Input Email</th>
                                <th className="p-2">UID Matched Account</th>
                                <th className="p-2">Email Matched Account</th>
                                <th className="p-2">Conflict Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {smartMatchResult.conflictingRecords.map((c: any, idx: number) => (
                                <tr key={idx} className="hover:bg-card/50 text-purple-600 dark:text-purple-400">
                                  <td className="p-2 font-mono font-bold">{c.rowNumber}</td>
                                  <td className="p-2 font-mono">{c.inputUid}</td>
                                  <td className="p-2">{c.inputEmail}</td>
                                  <td className="p-2 font-semibold">{c.uidMatchName}</td>
                                  <td className="p-2 font-semibold">{c.emailMatchName}</td>
                                  <td className="p-2 text-foreground">{c.reason}</td>
                                </tr>
                              ))}
                              {smartMatchResult.conflictingRecords.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    No conflicting UID/email pairs detected.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Sub-Tab 4: Duplicates */}
                      {smartActiveTab === "duplicates" && (
                        <div className="mt-3 overflow-x-auto max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-card text-muted-foreground uppercase font-semibold sticky top-0">
                              <tr>
                                <th className="p-2 w-16">Row #</th>
                                <th className="p-2">Identifier</th>
                                <th className="p-2">Note</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {smartMatchResult.duplicateRecords.map((d: any, idx: number) => (
                                <tr key={idx} className="hover:bg-card/50 text-amber-600 dark:text-amber-400">
                                  <td className="p-2 font-mono">{d.rowNumber}</td>
                                  <td className="p-2 font-mono font-semibold">{d.identifier}</td>
                                  <td className="p-2">Appears multiple times in input dataset. Deduplicated automatically.</td>
                                </tr>
                              ))}
                              {smartMatchResult.duplicateRecords.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                                    No duplicate entries in input dataset.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Selection Student Table */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" /> Paginated Manual Selection
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Select individual students across pages with persistence. {selectedStudentUids.length} selected.
                    </p>
                  </div>
                  {selectedStudentUids.length > 0 && (
                    <Button
                      onClick={handleAssignSelectedManualStudents}
                      disabled={actionLoading}
                      className="rounded-xl text-xs flex items-center gap-1.5"
                    >
                      <UserCheck className="w-4 h-4" /> Assign Selected ({selectedStudentUids.length})
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-y border-border text-muted-foreground uppercase font-semibold">
                      <tr>
                        <th className="p-3 w-10">
                          <input
                            type="checkbox"
                            checked={
                              studentList.length > 0 &&
                              studentList.every((s) => selectedStudentUids.includes(s.uid))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newUids = Array.from(new Set([...selectedStudentUids, ...studentList.map((s) => s.uid)]));
                                setSelectedStudentUids(newUids);
                              } else {
                                const currentBatch = studentList.map((s) => s.uid);
                                setSelectedStudentUids(selectedStudentUids.filter((u) => !currentBatch.includes(u)));
                              }
                            }}
                            className="w-4 h-4 rounded text-primary"
                          />
                        </th>
                        <th className="p-3">UID</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Program</th>
                        <th className="p-3">Semester</th>
                        <th className="p-3">Section</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {studentList.map((student) => {
                        const isChecked = selectedStudentUids.includes(student.uid);
                        return (
                          <tr key={student.id} className="hover:bg-muted/30">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentUids([...selectedStudentUids, student.uid]);
                                  } else {
                                    setSelectedStudentUids(selectedStudentUids.filter((u) => u !== student.uid));
                                  }
                                }}
                                className="w-4 h-4 rounded text-primary"
                              />
                            </td>
                            <td className="p-3 font-mono font-semibold">{student.uid}</td>
                            <td className="p-3 font-medium">{student.name}</td>
                            <td className="p-3 text-muted-foreground">{student.email}</td>
                            <td className="p-3">{student.academicContext?.program || "CSE"}</td>
                            <td className="p-3">{student.academicContext?.semester || "Sem 5"}</td>
                            <td className="p-3 font-mono">{student.academicContext?.section || "A1"}</td>
                          </tr>
                        );
                      })}
                      {studentList.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            No students found. Use filters above or click search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-muted-foreground">
                    Showing page {studentsPage} of {studentsTotalPages} ({studentsTotalCount} total students)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={studentsPage <= 1}
                      onClick={() => handleSearchStudents(studentsPage - 1)}
                      className="rounded-xl text-xs"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={studentsPage >= studentsTotalPages}
                      onClick={() => handleSearchStudents(studentsPage + 1)}
                      className="rounded-xl text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              {/* Saved Groups Cohort Section */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" /> Saved Cohorts &amp; Reusable Student Groups
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    placeholder="New Cohort Group Name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-background border border-border text-sm flex-1 min-w-[200px]"
                  />
                  <select
                    value={groupType}
                    onChange={(e) => setGroupType(e.target.value as any)}
                    className="px-3.5 py-2 rounded-xl bg-background border border-border text-sm"
                  >
                    <option value="filter_dynamic">Dynamic Filter (Auto-updates with new enrollments)</option>
                    <option value="snapshot_fixed">Fixed Snapshot (Selected students only)</option>
                  </select>
                  <Button onClick={handleSaveCurrentGroup} variant="outline" className="rounded-xl text-xs">
                    Save Group
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  {savedGroups.map((group) => (
                    <div key={group.id} className="p-3 bg-muted/40 border border-border rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{group.name}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted">
                          {group.groupType === "filter_dynamic" ? "Dynamic" : "Fixed"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{group.studentCount || 0} students</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: BATCH & TIME-SLOT MANAGEMENT */}
      {activeTab === "slots" && (
        <div className="space-y-6">
          {!currentSchedule ? (
            <div className="p-8 text-center border border-dashed rounded-2xl text-muted-foreground">
              Please select a schedule to manage examination slots.
            </div>
          ) : (
            <>
              {/* Allocation Controls Banner */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" /> Automatic Batch &amp; Slot Distribution
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Divide thousands of eligible students across slots based on configured capacity and distribution rules.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={allocationStrategy}
                    onChange={(e) => setAllocationStrategy(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-background border border-border text-xs font-medium"
                  >
                    <option value="balanced">Balanced (Evenly spread students)</option>
                    <option value="sequential">Sequential (Fill slot to capacity then move next)</option>
                    <option value="section_grouped">Section Grouped (Keep same sections in same slot)</option>
                    <option value="random">Randomized</option>
                  </select>

                  <Button
                    onClick={handleAllocateSlots}
                    disabled={actionLoading || !currentSchedule.slots?.length}
                    className="rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" /> Distribute Students Now
                  </Button>
                </div>
              </div>

              {/* Slot Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {currentSchedule.slots?.map((slot: any) => {
                  const capacityPercent = Math.min(100, Math.round(((slot.assignedCount || 0) / (slot.capacity || 1)) * 100));
                  return (
                    <div key={slot.id} className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono text-[10px] text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded">
                            {slot.slotCode}
                          </span>
                          <h4 className="font-bold text-base mt-1">{slot.name}</h4>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="text-rose-500 hover:text-rose-600 p-1 h-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span>{slot.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span>{slot.startTime} - {slot.endTime}</span>
                        </div>
                        {slot.roomOrLab && (
                          <div className="text-[11px] font-mono text-muted-foreground">
                            Location: {slot.roomOrLab}
                          </div>
                        )}
                      </div>

                      {/* Capacity Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>Capacity Utilization</span>
                          <span>{slot.assignedCount || 0} / {slot.capacity} ({capacityPercent}%)</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              capacityPercent >= 100 ? "bg-rose-500" : capacityPercent >= 80 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${capacityPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Manual Slot & Auto-Generator Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Manual Slot Form */}
                <form onSubmit={handleCreateSlot} className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-base flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary" /> Add Individual Slot
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-muted-foreground mb-1">Slot Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Slot 1 (Morning)"
                        value={slotForm.name}
                        onChange={(e) => setSlotForm({ ...slotForm, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Slot Code</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. S1"
                        value={slotForm.slotCode}
                        onChange={(e) => setSlotForm({ ...slotForm, slotCode: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Date</label>
                      <input
                        type="date"
                        required
                        value={slotForm.date}
                        onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Capacity</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={slotForm.capacity}
                        onChange={(e) => setSlotForm({ ...slotForm, capacity: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Start Time</label>
                      <input
                        type="time"
                        required
                        value={slotForm.startTime}
                        onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">End Time</label>
                      <input
                        type="time"
                        required
                        value={slotForm.endTime}
                        onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={actionLoading} className="w-full rounded-xl text-xs">
                    Add Slot
                  </Button>
                </form>

                {/* Auto Slot Generator */}
                <form onSubmit={handleAutoGenerateSlots} className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Auto-Generate Multi-Day Slots
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-muted-foreground mb-1">Start Date</label>
                      <input
                        type="date"
                        required
                        value={autoSlotForm.startDate}
                        onChange={(e) => setAutoSlotForm({ ...autoSlotForm, startDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">End Date</label>
                      <input
                        type="date"
                        required
                        value={autoSlotForm.endDate}
                        onChange={(e) => setAutoSlotForm({ ...autoSlotForm, endDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Daily Start</label>
                      <input
                        type="time"
                        required
                        value={autoSlotForm.dailyStartTime}
                        onChange={(e) => setAutoSlotForm({ ...autoSlotForm, dailyStartTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Daily End</label>
                      <input
                        type="time"
                        required
                        value={autoSlotForm.dailyEndTime}
                        onChange={(e) => setAutoSlotForm({ ...autoSlotForm, dailyEndTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Duration (min)</label>
                      <input
                        type="number"
                        min="15"
                        required
                        value={autoSlotForm.slotDurationMinutes}
                        onChange={(e) =>
                          setAutoSlotForm({ ...autoSlotForm, slotDurationMinutes: parseInt(e.target.value) || 60 })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Capacity/Slot</label>
                      <input
                        type="number"
                        min="10"
                        required
                        value={autoSlotForm.capacityPerSlot}
                        onChange={(e) =>
                          setAutoSlotForm({ ...autoSlotForm, capacityPerSlot: parseInt(e.target.value) || 300 })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Break Gap (min)</label>
                      <input
                        type="number"
                        min="0"
                        max="240"
                        required
                        value={autoSlotForm.gapMinutes}
                        onChange={(e) =>
                          setAutoSlotForm({
                            ...autoSlotForm,
                            gapMinutes: parseInt(e.target.value) || 0,
                            breakDurationMinutes: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border"
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={actionLoading} className="w-full rounded-xl text-xs bg-primary">
                    Auto-Generate Slots
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 5: CALENDAR & TIMETABLE */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          <div className="border-b border-border pb-3">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> Examination Timetable &amp; Schedule Calendar
            </h3>
            <p className="text-xs text-muted-foreground">
              Chronological sequence of exam sessions across dates and labs.
            </p>
          </div>

          <div className="space-y-6">
            {Object.entries(
              currentSchedule?.slots?.reduce((acc: any, slot: any) => {
                acc[slot.date] = acc[slot.date] || [];
                acc[slot.date].push(slot);
                return acc;
              }, {}) || {}
            ).map(([date, slots]: [string, any]) => (
              <div key={date} className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <h4 className="font-bold text-sm">{date}</h4>
                  <span className="text-xs text-muted-foreground">({slots.length} scheduled slots)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {slots
                    .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime))
                    .map((s: any) => (
                      <div key={s.id} className="p-3 bg-muted/40 border border-border/80 rounded-xl space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-xs">{s.name}</span>
                          <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            {s.slotCode}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span>{s.startTime} - {s.endTime}</span>
                        </div>
                        <div className="text-xs font-medium text-foreground">
                          Capacity: {s.assignedCount || 0} / {s.capacity} students
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}

            {(!currentSchedule?.slots || currentSchedule.slots.length === 0) && (
              <div className="p-8 text-center border border-dashed rounded-2xl text-muted-foreground">
                No slots scheduled yet. Go to &quot;Batch &amp; Slot Management&quot; to add or auto-generate slots.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: ACCESS OVERRIDES & EXCEPTIONS */}
      {activeTab === "overrides" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" /> Access Overrides &amp; Exceptional Permissions
              </h3>
              <p className="text-xs text-muted-foreground">
                Revoke access, extend time windows, reassign slots, or reinstate eligibility with mandatory audit logs.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search UID or Name..."
                value={assignmentSearch}
                onChange={(e) => setAssignmentSearch(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs w-full sm:w-60"
              />
              <select
                value={assignmentStatusFilter}
                onChange={(e) => setAssignmentStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs"
              >
                <option value="">All Statuses</option>
                <option value="assigned">Assigned</option>
                <option value="revoked">Revoked</option>
                <option value="exception">Exception</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto bg-card border border-border rounded-2xl shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="p-3">UID</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Assigned Slot</th>
                  <th className="p-3">Date &amp; Time Window</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assignments.map((assignment) => (
                  <tr key={assignment.id} className="hover:bg-muted/30">
                    <td className="p-3 font-mono font-semibold">{assignment.studentUid}</td>
                    <td className="p-3 font-medium">{assignment.studentName}</td>
                    <td className="p-3">
                      {assignment.slot ? (
                        <span className="font-semibold">{assignment.slot.name} ({assignment.slot.slotCode})</span>
                      ) : (
                        <span className="text-amber-500 font-medium">Unallocated</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {assignment.slot ? `${assignment.slot.date} • ${assignment.slot.startTime} - ${assignment.slot.endTime}` : "-"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          assignment.status === "assigned"
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                            : assignment.status === "in_progress"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : assignment.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : assignment.status === "revoked"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                            : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                        }`}
                      >
                        {assignment.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      {assignment.status === "revoked" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReinstate(assignment.id || assignment.studentId, assignment.studentUid, assignment.studentId)}
                          className="text-xs h-7 rounded-lg text-emerald-500 border-emerald-500/30"
                        >
                          Reinstate
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setOverrideModal({ isOpen: true, type: "revoke", student: assignment })
                            }
                            className="text-xs h-7 rounded-lg text-rose-500 hover:text-rose-600 border-rose-500/30"
                          >
                            Revoke
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setOverrideModal({ isOpen: true, type: "exception", student: assignment })
                            }
                            className="text-xs h-7 rounded-lg text-purple-500 hover:text-purple-600 border-purple-500/30"
                          >
                            Exception
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setOverrideModal({ isOpen: true, type: "reassign", student: assignment })
                            }
                            className="text-xs h-7 rounded-lg"
                          >
                            Move Slot
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No assignments found matching the search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Modal for Revoke / Exception / Reassign */}
          {overrideModal.isOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <h3 className="font-bold text-lg">
                  {overrideModal.type === "revoke"
                    ? `Revoke Access: ${overrideModal.student?.studentUid}`
                    : overrideModal.type === "exception"
                    ? `Grant Exceptional Window: ${overrideModal.student?.studentUid}`
                    : `Reassign Slot: ${overrideModal.student?.studentUid}`}
                </h3>

                {overrideModal.type === "reassign" && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Target Slot</label>
                    <select
                      value={targetSlotId}
                      onChange={(e) => setTargetSlotId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                    >
                      <option value="">-- Select Slot --</option>
                      {currentSchedule?.slots?.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.date} {s.startTime}-{s.endTime}) [{s.assignedCount}/{s.capacity}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {overrideModal.type === "exception" && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-muted-foreground mb-1">Custom Start ISO</label>
                      <input
                        type="datetime-local"
                        value={exceptionWindow.start}
                        onChange={(e) => setExceptionWindow({ ...exceptionWindow, start: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Custom End ISO</label>
                      <input
                        type="datetime-local"
                        value={exceptionWindow.end}
                        onChange={(e) => setExceptionWindow({ ...exceptionWindow, end: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg bg-background border border-border"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Mandatory Audit Reason *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Document the administrative justification for this override..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-background border border-border text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOverrideModal({ isOpen: false, type: "revoke", student: null })}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmOverride}
                    disabled={actionLoading}
                    className="rounded-xl text-xs bg-primary"
                  >
                    Confirm Action
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: ATTENDANCE & ATTEMPTS */}
      {activeTab === "attendance" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" /> Exam Attendance &amp; Completion Metrics
              </h3>
              <p className="text-xs text-muted-foreground">
                Real-time monitoring of student entry, active attempts, submissions, and absences.
              </p>
            </div>

            {selectedScheduleId && (
              <a
                href={examSchedulingAPI.exportAssignmentsCsvUrl(selectedScheduleId)}
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Export Attendance CSV
              </a>
            )}
          </div>

          {attendanceData ? (
            (() => {
              const stats = attendanceData.stats || attendanceData || {};
              const slotBreakdown = attendanceData.slotBreakdown || attendanceData.slots || [];
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">Total Assigned</p>
                      <p className="font-extrabold text-2xl mt-1">{stats.totalAssigned ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">In Progress</p>
                      <p className="font-extrabold text-2xl mt-1 text-amber-500">{stats.inProgress ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="font-extrabold text-2xl mt-1 text-emerald-500">{stats.completed ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">Absent / Unstarted</p>
                      <p className="font-extrabold text-2xl mt-1 text-muted-foreground">{stats.absent ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">Revoked</p>
                      <p className="font-extrabold text-2xl mt-1 text-rose-500">{stats.revoked ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">Exceptions</p>
                      <p className="font-extrabold text-2xl mt-1 text-purple-500">{stats.exceptions ?? 0}</p>
                    </div>
                  </div>

                  {/* Slot Breakdown Table */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
                    <h4 className="font-bold text-sm">Attendance by Slot</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 border-y border-border text-muted-foreground uppercase font-semibold">
                          <tr>
                            <th className="p-2.5">Slot Code</th>
                            <th className="p-2.5">Slot Name</th>
                            <th className="p-2.5">Date &amp; Time</th>
                            <th className="p-2.5">Capacity</th>
                            <th className="p-2.5">Assigned</th>
                            <th className="p-2.5">Completed</th>
                            <th className="p-2.5">Turnout %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y border-border">
                          {slotBreakdown.map((sb: any) => {
                            const turnout = sb.assignedCount > 0 ? Math.round(((sb.completed || 0) / sb.assignedCount) * 100) : 0;
                            return (
                              <tr key={sb.slotId || sb.id}>
                                <td className="p-2.5 font-mono font-semibold">{sb.slotCode || "-"}</td>
                                <td className="p-2.5 font-medium">{sb.name || "-"}</td>
                                <td className="p-2.5 text-muted-foreground">{sb.date} {sb.startTime}-{sb.endTime}</td>
                                <td className="p-2.5">{sb.capacity ?? "-"}</td>
                                <td className="p-2.5 font-semibold">{sb.assignedCount ?? sb.assigned ?? 0}</td>
                                <td className="p-2.5 text-emerald-500 font-semibold">{sb.completed ?? 0}</td>
                                <td className="p-2.5 font-bold">{turnout}%</td>
                              </tr>
                            );
                          })}
                          {slotBreakdown.length === 0 && (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-muted-foreground">
                                No slots configured or no attendance data recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              {selectedScheduleId ? "Loading attendance metrics..." : "Select a schedule to view attendance metrics."}
            </div>
          )}
        </div>
      )}

      {/* TAB 8: AUDIT LOGS */}
      {activeTab === "audit" && (
        <div className="space-y-6">
          <div className="border-b border-border pb-3">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Administrative Audit Trail &amp; Access Log
            </h3>
            <p className="text-xs text-muted-foreground">
              Immutable record of schedule creation, slot allocation, access revocations, overrides, and student attempts.
            </p>
          </div>

          <div className="overflow-x-auto bg-card border border-border rounded-2xl shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Target Student UID</th>
                  <th className="p-3">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 font-medium">{log.actorEmail || log.actorId}</td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-semibold">{log.studentUid || "-"}</td>
                    <td className="p-3 max-w-xs truncate" title={log.reason || ""}>
                      {log.reason || "-"}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No audit records found for this scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
