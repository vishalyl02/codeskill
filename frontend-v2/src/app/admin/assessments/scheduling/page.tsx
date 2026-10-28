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
  Copy,
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

const getTodayDateStr = () => new Date().toISOString().split("T")[0];
const getFutureDateStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

const getInclusiveDates = (startStr?: string, endStr?: string): string[] => {
  if (!startStr) return [];
  const startParts = startStr.split("-").map(Number);
  if (startParts.length !== 3 || startParts.some(isNaN)) return [startStr];
  const [sy, sm, sd] = startParts;
  const cur = new Date(Date.UTC(sy, sm - 1, sd));

  let endDt = cur;
  if (endStr) {
    const endParts = endStr.split("-").map(Number);
    if (endParts.length === 3 && !endParts.some(isNaN)) {
      endDt = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
    }
  }

  const result: string[] = [];
  while (cur.getTime() <= endDt.getTime() && result.length < 31) {
    result.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
};

const formatReadableDate = (dateStr: string): string => {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
};

export default function AdminExamSchedulingPage() {
  const [activeTab, setActiveTab] = useState<TabType>("schedules");
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [currentSchedule, setCurrentSchedule] = useState<any | null>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form State for Create / Edit Schedule (defaults to current days)
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
    startDate: getTodayDateStr(),
    endDate: getFutureDateStr(2),
    scheduleMode: "slotted",
    config: {
      earlyAccessMinutes: 10,
      lateStartAllowanceMinutes: 15,
      gracePeriodMinutes: 5,
      allowResumeOnDisconnect: true,
      allowSingleActiveAttempt: true,
      strictSlotBoundary: true,
      startDate: getTodayDateStr(),
      endDate: getFutureDateStr(2),
      scheduleMode: "slotted",
      isFlexibleAvailability: false,
      flexibleWindowStart: `${getTodayDateStr()}T09:00`,
      flexibleWindowEnd: `${getFutureDateStr(2)}T18:00`,
      attemptDurationMinutes: 60,
      completionGracePeriodMinutes: 15,
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
  const [filterDestination, setFilterDestination] = useState<string>("distribute");
  const [studentList, setStudentList] = useState<any[]>([]);
  const [selectedStudentUids, setSelectedStudentUids] = useState<string[]>([]);
  const [selectedStudentMeta, setSelectedStudentMeta] = useState<
    Record<string, { uid: string; name: string; email?: string; section?: string; department?: string; semester?: any }>
  >({});
  const [isFilterSelectionActive, setIsFilterSelectionActive] = useState<boolean>(false);
  const [excludedStudentUids, setExcludedStudentUids] = useState<string[]>([]);
  const [isStudentSelectionDrawerOpen, setIsStudentSelectionDrawerOpen] = useState<boolean>(false);
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
    startDate: getTodayDateStr(),
    endDate: getFutureDateStr(2),
    dailyStartTime: "09:30",
    dailyEndTime: "16:10",
    slotDurationMinutes: 200,
    breakDurationMinutes: 0,
    gapMinutes: 0,
    capacityPerSlot: 150,
    slotPrefix: "Batch Slot",
    strategy: "balanced",
  });
  const [copySlotModal, setCopySlotModal] = useState<{
    isOpen: boolean;
    sourceDate: string;
    targetDates: string[];
  }>({
    isOpen: false,
    sourceDate: getTodayDateStr(),
    targetDates: [getFutureDateStr(1), getFutureDateStr(2)],
  });
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("all");
  const [allocationStrategy, setAllocationStrategy] = useState<string>("balanced");

  // Interactive Distribution & Preview Dialog State
  const [distributeModal, setDistributeModal] = useState<{
    isOpen: boolean;
    strategy: "balanced" | "sequential" | "section_grouped" | "random";
    sortBy: "uid" | "name" | "section";
    perSlotCount: number | "";
    selectedSlotIds: string[];
    targetScope: "all_eligible" | "selected_only";
    rebalanceExisting: boolean;
    preview: any | null;
    isPreviewLoading: boolean;
  }>({
    isOpen: false,
    strategy: "balanced",
    sortBy: "uid",
    perSlotCount: "",
    selectedSlotIds: [],
    targetScope: "all_eligible",
    rebalanceExisting: false,
    preview: null,
    isPreviewLoading: false,
  });

  // Assignments & Bulk Overrides State
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState<string>("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<string>("");
  const [assignmentSlotFilter, setAssignmentSlotFilter] = useState<string>("");
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    type: "revoke" | "exception" | "reassign";
    student: any | null;
  }>({ isOpen: false, type: "revoke", student: null });
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [exceptionWindow, setExceptionWindow] = useState({ start: "", end: "" });
  const [targetSlotId, setTargetSlotId] = useState<string>("");

  // Bulk Override Action Modals
  const [bulkRevokeModal, setBulkRevokeModal] = useState<{ isOpen: boolean; reason: string }>({
    isOpen: false,
    reason: "",
  });
  const [bulkChangeSlotModal, setBulkChangeSlotModal] = useState<{
    isOpen: boolean;
    targetSlotId: string;
    reason: string;
    forceImmediate: boolean;
  }>({
    isOpen: false,
    targetSlotId: "",
    reason: "",
    forceImmediate: false,
  });
  const [bulkReinstateModal, setBulkReinstateModal] = useState<{
    isOpen: boolean;
    targetSlotId: string;
    reason: string;
  }>({
    isOpen: false,
    targetSlotId: "",
    reason: "",
  });

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
          startDate: sched.config?.startDate || "2026-10-28",
          endDate: sched.config?.endDate || "2026-10-30",
          scheduleMode: sched.config?.scheduleMode || (sched.config?.isFlexibleAvailability ? "flexible" : "slotted"),
          config: {
            earlyAccessMinutes: sched.config?.earlyAccessMinutes ?? 10,
            lateStartAllowanceMinutes: sched.config?.lateStartAllowanceMinutes ?? 15,
            gracePeriodMinutes: sched.config?.gracePeriodMinutes ?? 5,
            allowResumeOnDisconnect: sched.config?.allowResume ?? true,
            allowSingleActiveAttempt: sched.config?.allowedAttempts === 1,
            strictSlotBoundary: sched.config?.strictTimeBoundary ?? true,
            startDate: sched.config?.startDate || "2026-10-28",
            endDate: sched.config?.endDate || "2026-10-30",
            scheduleMode: sched.config?.scheduleMode || (sched.config?.isFlexibleAvailability ? "flexible" : "slotted"),
            isFlexibleAvailability: Boolean(sched.config?.isFlexibleAvailability),
            flexibleWindowStart: sched.config?.flexibleWindowStart || "2026-10-28T09:00",
            flexibleWindowEnd: sched.config?.flexibleWindowEnd || "2026-10-30T18:00",
            attemptDurationMinutes: sched.config?.attemptDurationMinutes ?? 60,
            completionGracePeriodMinutes: sched.config?.completionGracePeriodMinutes ?? 15,
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
      await loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to auto-generate slots", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoadThreeDayPreset = () => {
    const sDate = scheduleForm.config.startDate || currentSchedule?.config?.startDate || getTodayDateStr();
    const eDate = scheduleForm.config.endDate || currentSchedule?.config?.endDate || getFutureDateStr(2);
    setAutoSlotForm({
      startDate: sDate,
      endDate: eDate,
      dailyStartTime: "09:30",
      dailyEndTime: "16:10",
      slotDurationMinutes: 200,
      breakDurationMinutes: 0,
      gapMinutes: 0,
      capacityPerSlot: 150,
      slotPrefix: "Batch Slot",
      strategy: "balanced",
    });
    showNotification(`Loaded 3-Day Exam Preset (${formatReadableDate(sDate)} to ${formatReadableDate(eDate)}; 2 Slots/Day: 9:30 AM–12:50 PM & 12:50 PM–4:10 PM)`);
  };

  const handleCopyDaySlots = async () => {
    if (!selectedScheduleId || !copySlotModal.sourceDate || copySlotModal.targetDates.length === 0) return;
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.copyDaySlots(selectedScheduleId, {
        sourceDate: copySlotModal.sourceDate,
        targetDates: copySlotModal.targetDates,
      });
      const count = res.data?.length || 0;
      showNotification(`Copied ${count} slots to target dates (${copySlotModal.targetDates.join(", ")})!`);
      setCopySlotModal((prev) => ({ ...prev, isOpen: false }));
      await loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to copy slots", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Are you sure you want to delete this slot? Any assigned students will become unallocated.")) return;
    try {
      await examSchedulingAPI.deleteSlot(selectedScheduleId, slotId);
      showNotification("Slot deleted.");
      await loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to delete slot", "error");
    }
  };

  // Bulk Student Assignment Actions
  const handleAssignFilteredStudents = async () => {
    if (!selectedScheduleId) return;
    const destName =
      filterDestination === "distribute"
        ? "and distribute them evenly across all active slots"
        : filterDestination === "pool"
        ? "to the unassigned schedule pool"
        : `to slot "${currentSchedule?.slots?.find((s: any) => s.id === filterDestination)?.name || filterDestination}"`;

    if (!confirm(`Assign all students matching current filters ${destName} in schedule "${currentSchedule?.title}"?`)) return;
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkAssign(selectedScheduleId, {
        source: "filter",
        selectionType: "filter",
        filterCriteria,
        targetSlotId: filterDestination === "pool" ? undefined : filterDestination,
        autoDistribute: filterDestination === "distribute",
      });
      const count = res.data?.assigned ?? res.data?.assignedCount ?? 0;
      showNotification(`Successfully assigned ${count} students!`);
      await loadScheduleDetails(selectedScheduleId);
      await loadAssignments();
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
        source: "manual",
        selectionType: "manual",
        studentIds: selectedStudentUids,
        studentUids: selectedStudentUids,
      });
      const count = res.data?.assigned ?? res.data?.assignedCount ?? selectedStudentUids.length;
      showNotification(`Assigned ${count} selected students!`);
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
        source: "csv",
        selectionType: "csv",
        studentIds: uids,
        studentUids: uids,
      });
      const count = res.data?.assigned ?? res.data?.assignedCount ?? uids.length;
      showNotification(`Committed ${count} students from CSV!`);
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
        source: "manual",
        selectionType: "manual",
        studentIds: studentUids,
        studentUids,
      });
      const count = res.data?.assigned ?? res.data?.assignedCount ?? studentUids.length;
      showNotification(`Committed & assigned ${count} matched students to schedule!`);
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to commit matched students", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // --- 1. SELECTION CONTROLS (End-to-End Deduplicated Set Architecture) ---

  const handleToggleSelectStudent = (student: any) => {
    const uid = student.uid;
    const exists = selectedStudentUids.includes(uid);
    if (exists) {
      setSelectedStudentUids((prev) => prev.filter((u) => u !== uid));
      setSelectedStudentMeta((prev) => {
        const copy = { ...prev };
        delete copy[uid];
        return copy;
      });
      if (isFilterSelectionActive) {
        setExcludedStudentUids((prev) => Array.from(new Set([...prev, uid])));
      }
    } else {
      setSelectedStudentUids((prev) => Array.from(new Set([...prev, uid])));
      setSelectedStudentMeta((prev) => ({
        ...prev,
        [uid]: {
          uid,
          name: student.name || uid,
          email: student.email,
          section: student.academicContext?.section || student.section,
          department: student.academicContext?.program || student.department,
          semester: student.academicContext?.semester || student.semester,
        },
      }));
      if (isFilterSelectionActive) {
        setExcludedStudentUids((prev) => prev.filter((u) => u !== uid));
      }
    }
  };

  const handleSelectAllOnPage = () => {
    if (!studentList.length) return;
    const newUids = Array.from(new Set([...selectedStudentUids, ...studentList.map((s) => s.uid)]));
    setSelectedStudentUids(newUids);
    const newMeta = { ...selectedStudentMeta };
    studentList.forEach((s) => {
      newMeta[s.uid] = {
        uid: s.uid,
        name: s.name || s.uid,
        email: s.email,
        section: s.academicContext?.section || s.section,
        department: s.academicContext?.program || s.department,
        semester: s.academicContext?.semester || s.semester,
      };
    });
    setSelectedStudentMeta(newMeta);
    showNotification(`Selected ${studentList.length} students on current page (Total selected: ${newUids.length})`);
  };

  const handleDeselectAllOnPage = () => {
    const pageUids = new Set(studentList.map((s) => s.uid));
    setSelectedStudentUids((prev) => prev.filter((u) => !pageUids.has(u)));
    setSelectedStudentMeta((prev) => {
      const copy = { ...prev };
      pageUids.forEach((u) => delete copy[u]);
      return copy;
    });
    showNotification(`Deselected students on current page`);
  };

  const handleSelectAllMatchingFilters = () => {
    if (previewCount === null || previewCount === 0) {
      showNotification("Please check live count first to verify matching student population", "error");
      return;
    }
    setIsFilterSelectionActive(true);
    setExcludedStudentUids([]);
    // Merge students from current search results
    const newMeta = { ...selectedStudentMeta };
    studentList.forEach((s) => {
      newMeta[s.uid] = {
        uid: s.uid,
        name: s.name || s.uid,
        email: s.email,
        section: s.academicContext?.section || s.section,
        department: s.academicContext?.program || s.department,
        semester: s.academicContext?.semester || s.semester,
      };
    });
    const pageUids = studentList.map((s) => s.uid);
    setSelectedStudentUids((prev) => Array.from(new Set([...prev, ...pageUids])));
    setSelectedStudentMeta(newMeta);
    showNotification(`Selected all ${previewCount} students matching current filters (Exclusions: 0)`);
  };

  const handleDeselectAllMatchingFilters = () => {
    setIsFilterSelectionActive(false);
    setExcludedStudentUids([]);
    showNotification("Deselected filtered population");
  };

  const handleClearSelection = () => {
    setSelectedStudentUids([]);
    setSelectedStudentMeta({});
    setExcludedStudentUids([]);
    setIsFilterSelectionActive(false);
    showNotification("Cleared student selection. Existing assignments remain unchanged.");
  };

  const handleRemoveSelectedStudent = (uid: string) => {
    setSelectedStudentUids((prev) => prev.filter((u) => u !== uid));
    setSelectedStudentMeta((prev) => {
      const copy = { ...prev };
      delete copy[uid];
      return copy;
    });
    if (isFilterSelectionActive) {
      setExcludedStudentUids((prev) => Array.from(new Set([...prev, uid])));
    }
  };

  const handleSelectAllImported = () => {
    if (!smartMatchResult?.matchedStudents?.length) return;
    const importedUids = smartMatchResult.matchedStudents.map((s: any) => s.uid);
    const newUids = Array.from(new Set([...selectedStudentUids, ...importedUids]));
    setSelectedStudentUids(newUids);
    const newMeta = { ...selectedStudentMeta };
    smartMatchResult.matchedStudents.forEach((s: any) => {
      newMeta[s.uid] = {
        uid: s.uid,
        name: s.name || s.uid,
        email: s.email,
        section: s.section,
        department: s.department,
        semester: s.semester,
      };
    });
    setSelectedStudentMeta(newMeta);
    showNotification(`Selected all ${importedUids.length} imported students (Total selected: ${newUids.length})`);
  };

  const handleDeselectAllImported = () => {
    if (!smartMatchResult?.matchedStudents?.length) return;
    const importedUids = new Set(smartMatchResult.matchedStudents.map((s: any) => s.uid));
    setSelectedStudentUids((prev) => prev.filter((u) => !importedUids.has(u)));
    setSelectedStudentMeta((prev) => {
      const copy = { ...prev };
      importedUids.forEach((u: any) => delete copy[u]);
      return copy;
    });
    showNotification(`Deselected all imported students from active selection`);
  };

  const handleReplaceSelection = (newUids: string[], newMetas?: any[]) => {
    if (
      !confirm(
        `Replace current selection (${selectedStudentUids.length} students) with the ${newUids.length} students from this list?`
      )
    ) {
      return;
    }
    const metaRecord: Record<string, any> = {};
    if (newMetas) {
      newMetas.forEach((m) => {
        if (m.uid) metaRecord[m.uid] = m;
      });
    }
    setSelectedStudentUids(newUids);
    setSelectedStudentMeta(metaRecord);
    setIsFilterSelectionActive(false);
    setExcludedStudentUids([]);
    showNotification(`Active selection updated to ${newUids.length} unique students.`);
  };

  // --- 2. DISTRIBUTION WORKFLOW & PREVIEW MODAL ---

  const handleOpenDistributeModal = () => {
    if (!currentSchedule) {
      showNotification("Please select an exam schedule first", "error");
      return;
    }
    if (!currentSchedule.slots || currentSchedule.slots.length === 0) {
      showNotification("No exam slots found in schedule. Please add or auto-generate slots first.", "error");
      return;
    }
    setDistributeModal({
      isOpen: true,
      strategy: (allocationStrategy as any) || "balanced",
      sortBy: "uid",
      perSlotCount: "",
      selectedSlotIds: currentSchedule.slots.map((s: any) => s.id),
      targetScope: selectedStudentUids.length > 0 ? "selected_only" : "all_eligible",
      rebalanceExisting: false,
      preview: null,
      isPreviewLoading: false,
    });
  };

  const handleCalculateDistributionPreview = async () => {
    if (!selectedScheduleId) return;
    if (distributeModal.selectedSlotIds.length === 0) {
      showNotification("Please select at least one target exam slot for distribution", "error");
      return;
    }
    setDistributeModal((prev) => ({ ...prev, isPreviewLoading: true }));
    try {
      const payload: any = {
        strategy: distributeModal.strategy,
        sortBy: distributeModal.sortBy,
        perSlotCount: distributeModal.perSlotCount ? Number(distributeModal.perSlotCount) : undefined,
        slotIds: distributeModal.selectedSlotIds,
        rebalanceExisting: distributeModal.rebalanceExisting,
        previewOnly: true,
      };

      if (distributeModal.targetScope === "selected_only" && selectedStudentUids.length > 0) {
        payload.studentIds = selectedStudentUids;
      }

      const res = await examSchedulingAPI.previewAllocateSlots(selectedScheduleId, payload);
      setDistributeModal((prev) => ({
        ...prev,
        preview: res.data,
        isPreviewLoading: false,
      }));
      showNotification(`Preview calculated: Proposed allocation of ${res.data.allocatedCount} students across ${res.data.slots?.length || 0} slots.`);
    } catch (err: any) {
      setDistributeModal((prev) => ({ ...prev, isPreviewLoading: false }));
      showNotification(err.response?.data?.message || "Failed to calculate distribution preview", "error");
    }
  };

  const handleCommitDistribution = async () => {
    if (!selectedScheduleId) return;
    if (distributeModal.selectedSlotIds.length === 0) {
      showNotification("Please select at least one target exam slot", "error");
      return;
    }
    setActionLoading(true);
    try {
      const payload: any = {
        strategy: distributeModal.strategy,
        sortBy: distributeModal.sortBy,
        perSlotCount: distributeModal.perSlotCount ? Number(distributeModal.perSlotCount) : undefined,
        slotIds: distributeModal.selectedSlotIds,
        rebalanceExisting: distributeModal.rebalanceExisting,
      };

      if (distributeModal.targetScope === "selected_only" && selectedStudentUids.length > 0) {
        payload.studentIds = selectedStudentUids;
      }

      const res = await examSchedulingAPI.allocateSlots(selectedScheduleId, payload);
      const allocated = res.data.allocated ?? res.data.allocatedCount ?? 0;
      const unassigned = res.data.unassignedCount ?? 0;

      let msg = `Successfully distributed ${allocated} students!`;
      if (unassigned > 0) {
        msg += ` (${unassigned} students unassigned due to capacity limits)`;
      }
      showNotification(msg);

      setDistributeModal((prev) => ({ ...prev, isOpen: false, preview: null }));
      loadScheduleDetails(selectedScheduleId);
      loadAssignments();
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to commit distribution", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // --- 3. BULK ACCESS OVERRIDES & ASSIGNMENT MANAGEMENT ---

  const handleToggleSelectAssignment = (assignmentId: string) => {
    setSelectedAssignmentIds((prev) =>
      prev.includes(assignmentId) ? prev.filter((id) => id !== assignmentId) : [...prev, assignmentId]
    );
  };

  const handleSelectAllAssignmentsOnPage = () => {
    const pageIds = filteredAssignments.map((a) => a.id);
    setSelectedAssignmentIds((prev) => Array.from(new Set([...prev, ...pageIds])));
  };

  const handleDeselectAllAssignmentsOnPage = () => {
    const pageIds = new Set(filteredAssignments.map((a) => a.id));
    setSelectedAssignmentIds((prev) => prev.filter((id) => !pageIds.has(id)));
  };

  const handleClearAssignmentSelection = () => {
    setSelectedAssignmentIds([]);
  };

  const handleConfirmBulkRevoke = async () => {
    if (!selectedScheduleId || selectedAssignmentIds.length === 0) return;
    if (!bulkRevokeModal.reason.trim()) {
      alert("A mandatory documented reason is required to revoke access.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.revokeAccess(selectedScheduleId, {
        assignmentIds: selectedAssignmentIds,
        reason: bulkRevokeModal.reason.trim(),
      });
      showNotification(`Successfully revoked exam access for ${res.data.revokedCount} students.`);
      setBulkRevokeModal({ isOpen: false, reason: "" });
      setSelectedAssignmentIds([]);
      loadAssignments();
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to revoke access in bulk", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBulkChangeSlot = async () => {
    if (!selectedScheduleId || selectedAssignmentIds.length === 0) return;
    if (!bulkChangeSlotModal.targetSlotId) {
      alert("Please select a destination exam slot.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkReassignSlots(selectedScheduleId, {
        assignmentIds: selectedAssignmentIds,
        targetSlotId: bulkChangeSlotModal.targetSlotId,
        reason: bulkChangeSlotModal.reason.trim() || "Bulk reassigned by administrator",
        forceImmediate: bulkChangeSlotModal.forceImmediate,
      });
      showNotification(
        `Successfully moved ${res.data.reassignedCount} students to slot "${res.data.targetSlot?.name || 'Selected'}".`
      );
      setBulkChangeSlotModal({ isOpen: false, targetSlotId: "", reason: "", forceImmediate: false });
      setSelectedAssignmentIds([]);
      loadAssignments();
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to reassign slots in bulk", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBulkReinstate = async () => {
    if (!selectedScheduleId || selectedAssignmentIds.length === 0) return;
    if (!bulkReinstateModal.reason.trim()) {
      alert("A mandatory documented reason is required to reinstate access.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await examSchedulingAPI.bulkReinstateAccess(selectedScheduleId, {
        assignmentIds: selectedAssignmentIds,
        targetSlotId: bulkReinstateModal.targetSlotId || undefined,
        reason: bulkReinstateModal.reason.trim(),
      });
      showNotification(`Successfully reinstated access for ${res.data.reinstatedCount} students.`);
      setBulkReinstateModal({ isOpen: false, targetSlotId: "", reason: "" });
      setSelectedAssignmentIds([]);
      loadAssignments();
      loadScheduleDetails(selectedScheduleId);
    } catch (err: any) {
      showNotification(err.response?.data?.message || "Failed to reinstate access in bulk", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered assignments computed property
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (assignmentStatusFilter && a.status !== assignmentStatusFilter) return false;
      if (assignmentSlotFilter && a.slotId !== assignmentSlotFilter) return false;
      if (assignmentSearch.trim()) {
        const query = assignmentSearch.toLowerCase();
        const uid = (a.studentUid || "").toLowerCase();
        const name = (a.studentName || "").toLowerCase();
        const email = (a.academicSnapshot?.email || "").toLowerCase();
        return uid.includes(query) || name.includes(query) || email.includes(query);
      }
      return true;
    });
  }, [assignments, assignmentStatusFilter, assignmentSlotFilter, assignmentSearch]);

  // Access Override Actions (Single)
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
                startDate: getTodayDateStr(),
                endDate: getFutureDateStr(2),
                scheduleMode: "slotted",
                config: {
                  earlyAccessMinutes: 10,
                  lateStartAllowanceMinutes: 15,
                  gracePeriodMinutes: 5,
                  allowResumeOnDisconnect: true,
                  allowSingleActiveAttempt: true,
                  strictSlotBoundary: true,
                  startDate: getTodayDateStr(),
                  endDate: getFutureDateStr(2),
                  scheduleMode: "slotted",
                  isFlexibleAvailability: false,
                  flexibleWindowStart: `${getTodayDateStr()}T09:00`,
                  flexibleWindowEnd: `${getFutureDateStr(2)}T18:00`,
                  attemptDurationMinutes: 60,
                  completionGracePeriodMinutes: 15,
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

            {/* Step 2: Multi-Day Exam Dates & Timezone */}
            <div className="md:col-span-2 bg-muted/30 border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-primary">
                  <Calendar className="w-4 h-4" /> Multi-Day Schedule Dates &amp; Scope
                </span>
                <span className="text-[11px] font-medium bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                  Timezone: {scheduleForm.timezone} (IST)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-muted-foreground mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={scheduleForm.config.startDate || getTodayDateStr()}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        config: { ...scheduleForm.config, startDate: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1">End Date (Inclusive) *</label>
                  <input
                    type="date"
                    required
                    value={scheduleForm.config.endDate || getFutureDateStr(2)}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        config: { ...scheduleForm.config, endDate: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1">Timezone</label>
                  <input
                    type="text"
                    value={scheduleForm.timezone}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60 text-xs">
                {(() => {
                  const s = scheduleForm.config.startDate || getTodayDateStr();
                  const e = scheduleForm.config.endDate || getFutureDateStr(2);
                  const incDates = getInclusiveDates(s, e);
                  return (
                    <>
                      <span className="text-muted-foreground">
                        📅 Included Dates:{" "}
                        <strong className="text-foreground">
                          {incDates.map(formatReadableDate).join(", ") || s}
                        </strong>{" "}
                        ({incDates.length} Continuous Examination Days)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setScheduleForm({
                            ...scheduleForm,
                            config: {
                              ...scheduleForm.config,
                              startDate: getTodayDateStr(),
                              endDate: getFutureDateStr(2),
                            },
                          })
                        }
                        className="text-primary hover:underline text-[11px]"
                      >
                        Reset to 3 Days Starting Today
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Step 3: Examination Mode (Slotted vs Flexible) */}
            <div className="md:col-span-2 bg-card border border-border rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-foreground">
                <Clock className="w-4 h-4 text-primary" /> Examination Access Mode
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    scheduleForm.config.scheduleMode !== "flexible"
                      ? "border-primary bg-primary/5 text-foreground font-medium"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="slotted"
                    checked={scheduleForm.config.scheduleMode !== "flexible"}
                    onChange={() =>
                      setScheduleForm({
                        ...scheduleForm,
                        config: {
                          ...scheduleForm.config,
                          scheduleMode: "slotted",
                          isFlexibleAvailability: false,
                        },
                      })
                    }
                    className="mt-0.5 text-primary"
                  />
                  <div>
                    <div className="font-semibold text-foreground">Slotted Batches (Recommended)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Distribute students across distinct exam slots per day with individual capacities and start/end bounds.
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    scheduleForm.config.scheduleMode === "flexible"
                      ? "border-primary bg-primary/5 text-foreground font-medium"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="flexible"
                    checked={scheduleForm.config.scheduleMode === "flexible"}
                    onChange={() =>
                      setScheduleForm({
                        ...scheduleForm,
                        config: {
                          ...scheduleForm.config,
                          scheduleMode: "flexible",
                          isFlexibleAvailability: true,
                        },
                      })
                    }
                    className="mt-0.5 text-primary"
                  />
                  <div>
                    <div className="font-semibold text-foreground">Flexible Multi-Day Availability Window</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      All eligible students can start anytime between 28 and 30 Oct without requiring an individual slot.
                    </div>
                  </div>
                </label>
              </div>

              {scheduleForm.config.scheduleMode === "flexible" && (
                <div className="bg-muted/40 p-3 rounded-xl border border-border/80 space-y-3 animate-in fade-in-50 text-xs">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Continuous Multi-Day Window Settings
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-muted-foreground mb-1">Window Opens</label>
                      <input
                        type="datetime-local"
                        value={scheduleForm.config.flexibleWindowStart || "2026-10-28T09:00"}
                        onChange={(e) =>
                          setScheduleForm({
                            ...scheduleForm,
                            config: { ...scheduleForm.config, flexibleWindowStart: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Window Closes</label>
                      <input
                        type="datetime-local"
                        value={scheduleForm.config.flexibleWindowEnd || "2026-10-30T18:00"}
                        onChange={(e) =>
                          setScheduleForm({
                            ...scheduleForm,
                            config: { ...scheduleForm.config, flexibleWindowEnd: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Attempt Duration (min)</label>
                      <input
                        type="number"
                        min="15"
                        max="360"
                        value={scheduleForm.config.attemptDurationMinutes || 60}
                        onChange={(e) =>
                          setScheduleForm({
                            ...scheduleForm,
                            config: {
                              ...scheduleForm.config,
                              attemptDurationMinutes: parseInt(e.target.value, 10) || 60,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1">Completion Grace (min)</label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={scheduleForm.config.completionGracePeriodMinutes || 15}
                        onChange={(e) =>
                          setScheduleForm({
                            ...scheduleForm,
                            config: {
                              ...scheduleForm.config,
                              completionGracePeriodMinutes: parseInt(e.target.value, 10) || 15,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Notice: Server-side deadlines are strictly enforced. Attempts started close to closing time must finish before the window + completion grace period closes.
                  </p>
                </div>
              )}
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
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      <div>
                        <span className="font-bold text-base text-foreground">{previewCount}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">
                          students matched across the entire database
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium text-muted-foreground whitespace-nowrap">Destination:</span>
                        <select
                          value={filterDestination}
                          onChange={(e) => setFilterDestination(e.target.value)}
                          className="px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-medium"
                        >
                          <option value="distribute">⚡ Distribute Evenly Across All Slots</option>
                          {currentSchedule?.slots?.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.slotCode}: {s.name} ({s.assignedCount || 0}/{s.capacity})
                            </option>
                          ))}
                          <option value="pool">📥 Schedule Pool Only (Unassigned)</option>
                        </select>
                      </div>

                      <Button
                        onClick={handleAssignFilteredStudents}
                        disabled={actionLoading || previewCount === 0}
                        className="rounded-xl text-xs flex items-center gap-1.5 bg-primary"
                      >
                        <UserCheck className="w-4 h-4" />
                        {filterDestination === "distribute"
                          ? `Assign & Distribute All ${previewCount} Across All Slots`
                          : filterDestination === "pool"
                          ? `Add All ${previewCount} to Schedule Pool`
                          : `Assign All ${previewCount} to Selected Slot`}
                      </Button>
                    </div>
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

              {/* Multi-Selection Student Table with Comprehensive Controls */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" /> Student Selection &amp; Deduplication Management
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Canonical Set-based unique student selection across pagination, filters, and imports.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                      Selected: {selectedStudentUids.length} unique students
                    </span>
                    {selectedStudentUids.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsStudentSelectionDrawerOpen(true)}
                        className="rounded-xl text-xs"
                      >
                        Inspect Selection ({selectedStudentUids.length})
                      </Button>
                    )}
                    {selectedStudentUids.length > 0 && (
                      <Button
                        onClick={handleAssignSelectedManualStudents}
                        disabled={actionLoading}
                        className="rounded-xl text-xs flex items-center gap-1.5 bg-primary"
                      >
                        <UserCheck className="w-4 h-4" /> Assign Selected to Schedule
                      </Button>
                    )}
                  </div>
                </div>

                {/* Selection Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-2.5 rounded-xl border border-border text-xs">
                  <span className="font-semibold text-muted-foreground text-[11px] uppercase mr-1">Controls:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllOnPage}
                    disabled={studentList.length === 0}
                    className="h-7 text-xs rounded-lg"
                  >
                    Select Page ({studentList.length})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectAllOnPage}
                    disabled={studentList.length === 0 || !studentList.some((s) => selectedStudentUids.includes(s.uid))}
                    className="h-7 text-xs rounded-lg"
                  >
                    Deselect Page
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllMatchingFilters}
                    disabled={previewCount === null || previewCount === 0}
                    className="h-7 text-xs rounded-lg text-primary border-primary/30"
                  >
                    Select All Matching Filters {previewCount !== null ? `(${previewCount})` : ""}
                  </Button>
                  {isFilterSelectionActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeselectAllMatchingFilters}
                      className="h-7 text-xs rounded-lg text-amber-500 border-amber-500/30"
                    >
                      Deselect Filtered
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    disabled={selectedStudentUids.length === 0 && !isFilterSelectionActive}
                    className="h-7 text-xs rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 ml-auto"
                  >
                    Clear Selection
                  </Button>
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
                                handleSelectAllOnPage();
                              } else {
                                handleDeselectAllOnPage();
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
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {studentList.map((student) => {
                        const isChecked = selectedStudentUids.includes(student.uid);
                        return (
                          <tr key={student.id || student.uid} className={`hover:bg-muted/30 ${isChecked ? "bg-primary/5" : ""}`}>
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectStudent(student)}
                                className="w-4 h-4 rounded text-primary"
                              />
                            </td>
                            <td className="p-3 font-mono font-semibold">{student.uid}</td>
                            <td className="p-3 font-medium">{student.name}</td>
                            <td className="p-3 text-muted-foreground">{student.email}</td>
                            <td className="p-3">{student.academicContext?.program || student.department || "CSE"}</td>
                            <td className="p-3">{student.academicContext?.semester || (student.semester ? `Sem ${student.semester}` : "Sem 5")}</td>
                            <td className="p-3 font-mono">{student.academicContext?.section || student.section || "A1"}</td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleSelectStudent(student)}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                                  isChecked
                                    ? "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20"
                                    : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                                }`}
                              >
                                {isChecked ? "Deselect" : "Select"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {studentList.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-muted-foreground">
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

              {/* Selected Students Inspection & Removal Modal Drawer */}
              {isStudentSelectionDrawerOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                  <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Users className="w-5 h-5 text-primary" /> Selected Unique Students ({selectedStudentUids.length})
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Review canonical unique selections or remove students individually.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsStudentSelectionDrawerOpen(false)}
                        className="rounded-lg h-8 w-8 p-0"
                      >
                        ✕
                      </Button>
                    </div>

                    <div className="overflow-y-auto flex-1 divide-y divide-border">
                      {selectedStudentUids.map((uid) => {
                        const meta = selectedStudentMeta[uid] || { uid, name: uid };
                        return (
                          <div key={uid} className="flex items-center justify-between py-2.5 px-1 hover:bg-muted/20">
                            <div>
                              <span className="font-mono font-semibold text-xs text-primary">{uid}</span>
                              <span className="font-medium text-xs ml-2 text-foreground">{meta.name}</span>
                              {meta.email && <span className="text-[11px] text-muted-foreground ml-2">({meta.email})</span>}
                              {meta.section && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded ml-2">Sec: {meta.section}</span>}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveSelectedStudent(uid)}
                              className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-7 px-2 text-xs rounded-lg"
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                      {selectedStudentUids.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground text-xs">
                          No students currently selected.
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearSelection}
                        disabled={selectedStudentUids.length === 0}
                        className="rounded-xl text-xs text-rose-500 hover:text-rose-600"
                      >
                        Clear All Selected
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setIsStudentSelectionDrawerOpen(false)}
                        className="rounded-xl text-xs"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              )}

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
                    variant="outline"
                    onClick={() => {
                      const allDates = Array.from(
                        new Set([
                          ...getInclusiveDates(currentSchedule.config?.startDate, currentSchedule.config?.endDate),
                          ...(currentSchedule.slots?.map((s: any) => s.date) || []),
                        ])
                      );
                      const firstDate = currentSchedule.slots?.[0]?.date || allDates[0] || getTodayDateStr();
                      const targetDates = allDates.filter((d) => d !== firstDate);
                      setCopySlotModal({
                        isOpen: true,
                        sourceDate: firstDate,
                        targetDates: targetDates.length ? targetDates : [getFutureDateStr(1), getFutureDateStr(2)],
                      });
                    }}
                    disabled={!currentSchedule.slots?.length}
                    className="rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Day&apos;s Slots
                  </Button>

                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (selectedScheduleId) {
                        await loadScheduleDetails(selectedScheduleId);
                        showNotification("Refreshed all slot counts and capacity data.");
                      }
                    }}
                    className="rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Slots
                  </Button>

                  <Button
                    onClick={handleOpenDistributeModal}
                    disabled={actionLoading || !currentSchedule.slots?.length}
                    className="rounded-xl text-xs flex items-center gap-1.5 bg-primary"
                  >
                    <Sparkles className="w-4 h-4" /> Distribute Students Now
                  </Button>
                </div>
              </div>

              {/* Distribution Configuration & Preview Modal */}
              {distributeModal.isOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                  <div className="bg-card border border-border rounded-2xl p-6 max-w-3xl w-full space-y-5 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in-50">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-primary" /> Automatic Student Distribution &amp; Preview
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Configure rules, preview proposed seat allocation, and confirm distribution safely.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDistributeModal((prev) => ({ ...prev, isOpen: false, preview: null }))}
                        className="rounded-lg h-8 w-8 p-0"
                      >
                        ✕
                      </Button>
                    </div>

                    <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                      {/* Configuration Controls Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/30 border border-border rounded-xl text-xs">
                        <div>
                          <label className="block font-semibold mb-1">Distribution Strategy</label>
                          <select
                            value={distributeModal.strategy}
                            onChange={(e) =>
                              setDistributeModal((prev) => ({
                                ...prev,
                                strategy: e.target.value as any,
                                preview: null,
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                          >
                            <option value="balanced">Balanced (Round-Robin)</option>
                            <option value="sequential">Sequential (Fill to Capacity)</option>
                            <option value="section_grouped">Section Grouped (Cohorts)</option>
                            <option value="random">Randomized</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold mb-1">Sort &amp; Assignment Order</label>
                          <select
                            value={distributeModal.sortBy}
                            onChange={(e) =>
                              setDistributeModal((prev) => ({
                                ...prev,
                                sortBy: e.target.value as any,
                                preview: null,
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                          >
                            <option value="uid">Student UID Order (Ascending)</option>
                            <option value="name">Student Name Order</option>
                            <option value="section">Section Order</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold mb-1">Max Students Per Slot</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Slot capacity limit (optional)"
                            value={distributeModal.perSlotCount}
                            onChange={(e) =>
                              setDistributeModal((prev) => ({
                                ...prev,
                                perSlotCount: e.target.value ? parseInt(e.target.value) : "",
                                preview: null,
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                          />
                        </div>

                        <div className="sm:col-span-2 md:col-span-3 pt-1 flex flex-wrap items-center gap-4 text-xs">
                          <div>
                            <span className="font-semibold block mb-1">Target Student Population:</span>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name="targetScope"
                                  checked={distributeModal.targetScope === "all_eligible"}
                                  onChange={() =>
                                    setDistributeModal((prev) => ({
                                      ...prev,
                                      targetScope: "all_eligible",
                                      preview: null,
                                    }))
                                  }
                                  className="w-3.5 h-3.5 text-primary"
                                />
                                <span>All Unassigned Eligible Students</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name="targetScope"
                                  checked={distributeModal.targetScope === "selected_only"}
                                  onChange={() =>
                                    setDistributeModal((prev) => ({
                                      ...prev,
                                      targetScope: "selected_only",
                                      preview: null,
                                    }))
                                  }
                                  className="w-3.5 h-3.5 text-primary"
                                />
                                <span>
                                  Only Currently Selected Students ({selectedStudentUids.length})
                                </span>
                              </label>
                            </div>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <input
                              type="checkbox"
                              checked={distributeModal.rebalanceExisting}
                              onChange={(e) =>
                                setDistributeModal((prev) => ({
                                  ...prev,
                                  rebalanceExisting: e.target.checked,
                                  preview: null,
                                }))
                              }
                              className="w-3.5 h-3.5 rounded text-primary"
                            />
                            <span>Rebalance already assigned students (who have not started exam)</span>
                          </label>
                        </div>
                      </div>

                      {/* Target Exam Slots Checklist */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">Select Destination Exam Slots:</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setDistributeModal((prev) => ({
                                  ...prev,
                                  selectedSlotIds: currentSchedule.slots.map((s: any) => s.id),
                                  preview: null,
                                }))
                              }
                              className="text-primary hover:underline text-[11px]"
                            >
                              Select All Slots
                            </button>
                            <span className="text-muted-foreground">•</span>
                            <button
                              type="button"
                              onClick={() =>
                                setDistributeModal((prev) => ({
                                  ...prev,
                                  selectedSlotIds: [],
                                  preview: null,
                                }))
                              }
                              className="text-muted-foreground hover:underline text-[11px]"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {currentSchedule.slots?.map((slot: any) => {
                            const isSelected = distributeModal.selectedSlotIds.includes(slot.id);
                            const remaining = Math.max(0, slot.capacity - (slot.assignedCount || 0));
                            return (
                              <label
                                key={slot.id}
                                className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition-all ${
                                  isSelected
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-background border-border/70 opacity-60"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setDistributeModal((prev) => ({
                                      ...prev,
                                      selectedSlotIds: e.target.checked
                                        ? [...prev.selectedSlotIds, slot.id]
                                        : prev.selectedSlotIds.filter((id) => id !== slot.id),
                                      preview: null,
                                    }));
                                  }}
                                  className="w-4 h-4 rounded text-primary mt-0.5"
                                />
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <div className="font-bold truncate">{slot.name}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {slot.date} • {slot.startTime}-{slot.endTime}
                                  </div>
                                  <div className="text-[11px] font-semibold text-primary">
                                    Available: {remaining} / {slot.capacity} seats
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Button to Trigger Preview Calculation */}
                      <div className="pt-1 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCalculateDistributionPreview}
                          disabled={distributeModal.isPreviewLoading || distributeModal.selectedSlotIds.length === 0}
                          className="rounded-xl text-xs flex items-center gap-1.5"
                        >
                          {distributeModal.isPreviewLoading ? <Spinner /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
                          Calculate Proposed Distribution Preview
                        </Button>
                      </div>

                      {/* Preview Calculation Results */}
                      {distributeModal.preview && (
                        <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-4 animate-in fade-in-50">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                            <div>
                              <h4 className="font-bold text-sm flex items-center gap-2 text-foreground">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Proposed Distribution Preview
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Safe simulation complete. Review allocation before committing to database.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                                Allocated: {distributeModal.preview.allocatedCount} students
                              </span>
                              {distributeModal.preview.unassignedCount > 0 && (
                                <span className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 font-bold border border-rose-500/20">
                                  Unassigned: {distributeModal.preview.unassignedCount} (Capacity exceeded)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Slot Simulations Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {distributeModal.preview.slots?.map((slot: any) => {
                              const newTotal = slot.newTotalCount || (slot.currentAssignedCount + slot.proposedCount);
                              const capPercent = Math.min(100, Math.round((newTotal / (slot.capacity || 1)) * 100));
                              return (
                                <div key={slot.id} className="p-3 bg-muted/30 border border-border rounded-xl text-xs space-y-2">
                                  <div className="flex justify-between items-start">
                                    <span className="font-bold text-foreground truncate">{slot.name}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">{slot.date}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[11px]">
                                      <span className="text-muted-foreground">Proposed Allocation:</span>
                                      <span className="font-semibold text-emerald-600">+{slot.proposedCount} students</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                      <span className="text-muted-foreground">New Total Utilization:</span>
                                      <span className="font-semibold">{newTotal} / {slot.capacity} ({capPercent}%)</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          capPercent >= 100 ? "bg-rose-500" : capPercent >= 80 ? "bg-amber-500" : "bg-emerald-500"
                                        }`}
                                        style={{ width: `${capPercent}%` }}
                                      />
                                    </div>
                                  </div>
                                  {slot.sampleStudents?.length > 0 && (
                                    <div className="text-[10px] text-muted-foreground pt-1 truncate">
                                      Sample: {slot.sampleStudents.map((s: any) => s.studentUid).slice(0, 3).join(", ")}...
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Modal Footer Controls */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDistributeModal((prev) => ({ ...prev, isOpen: false, preview: null }))}
                        className="rounded-xl text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCommitDistribution}
                        disabled={actionLoading || distributeModal.selectedSlotIds.length === 0}
                        className="rounded-xl text-xs bg-primary flex items-center gap-1.5"
                      >
                        {actionLoading ? <Spinner /> : <Sparkles className="w-4 h-4" />}
                        Confirm &amp; Commit Distribution
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Copy Day's Slots Dialog */}
              {copySlotModal.isOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                  <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in-50">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <Copy className="w-4 h-4 text-primary" /> Copy Day&apos;s Slot Template
                      </h3>
                      <button
                        type="button"
                        onClick={() => setCopySlotModal((prev) => ({ ...prev, isOpen: false }))}
                        className="text-muted-foreground hover:text-foreground text-sm font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-muted-foreground mb-1 font-medium">Source Template Date</label>
                        <select
                          value={copySlotModal.sourceDate}
                          onChange={(e) => setCopySlotModal({ ...copySlotModal, sourceDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                        >
                          {Array.from(new Set(currentSchedule.slots?.map((s: any) => s.date) || [])).map((d: any) => (
                            <option key={d} value={d}>
                              {d} ({currentSchedule.slots.filter((s: any) => s.date === d).length} slots)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-muted-foreground mb-1 font-medium">Destination Dates (Multi-Select)</label>
                        <div className="space-y-2 p-3 bg-muted/30 rounded-xl border border-border">
                          {(() => {
                            const allDates = Array.from(
                              new Set([
                                ...getInclusiveDates(currentSchedule.config?.startDate, currentSchedule.config?.endDate),
                                ...(currentSchedule.slots?.map((s: any) => s.date) || []),
                              ])
                            );
                            const destDates = allDates.filter((d) => d !== copySlotModal.sourceDate);
                            if (destDates.length === 0) {
                              return <p className="text-muted-foreground text-xs">No other destination dates configured in schedule.</p>;
                            }
                            return destDates.map((targetD) => {
                              const isChecked = copySlotModal.targetDates.includes(targetD);
                              return (
                                <label key={targetD} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setCopySlotModal({
                                        ...copySlotModal,
                                        targetDates: [...copySlotModal.targetDates, targetD],
                                      });
                                    } else {
                                      setCopySlotModal({
                                        ...copySlotModal,
                                        targetDates: copySlotModal.targetDates.filter((d) => d !== targetD),
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 rounded text-primary"
                                />
                                <span className="font-mono">{targetD}</span>
                              </label>
                            );
                            });
                          })()}
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Clones all slots from the source date to destination dates with identical timing, capacity, and settings without creating duplicates.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCopySlotModal((prev) => ({ ...prev, isOpen: false }))}
                        className="rounded-xl text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCopyDaySlots}
                        disabled={actionLoading || copySlotModal.targetDates.length === 0}
                        className="rounded-xl text-xs bg-primary flex items-center gap-1.5"
                      >
                        {actionLoading ? <Spinner /> : <Copy className="w-3.5 h-3.5" />}
                        Copy Slots Now
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-Day Timetable Filter & Overview Banner */}
              {(() => {
                const uniqueDates: string[] = Array.from(new Set<string>(currentSchedule.slots?.map((s: any) => String(s.date)) || [])).sort();
                const totalSlotsCount = currentSchedule.slots?.length || 0;
                const totalCap = currentSchedule.slots?.reduce((sum: number, s: any) => sum + (s.capacity || 0), 0) || 0;
                const totalAssigned = currentSchedule.slots?.reduce((sum: number, s: any) => sum + (s.assignedCount || 0), 0) || 0;

                return (
                  <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-sm text-foreground flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-primary" /> Multi-Day Schedule Scope
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {uniqueDates.length > 0
                            ? `${uniqueDates.length} examination days (${uniqueDates.join(", ")}) • ${totalSlotsCount} total slots`
                            : "No exam slots created yet."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-lg">
                          Occupancy: {totalAssigned} / {totalCap} students ({totalCap > 0 ? Math.round((totalAssigned / totalCap) * 100) : 0}%)
                        </span>
                      </div>
                    </div>

                    {uniqueDates.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border text-xs">
                        <span className="font-medium text-muted-foreground mr-1">Filter Day:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedDayFilter("all")}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                            selectedDayFilter === "all"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-muted hover:bg-muted/80 text-foreground"
                          }`}
                        >
                          All Days ({totalSlotsCount})
                        </button>
                        {uniqueDates.map((dateStr, idx) => {
                          const daySlots = currentSchedule.slots.filter((s: any) => s.date === dateStr);
                          const dayCap = daySlots.reduce((sum: number, s: any) => sum + (s.capacity || 0), 0);
                          const dayAssigned = daySlots.reduce((sum: number, s: any) => sum + (s.assignedCount || 0), 0);
                          return (
                            <button
                              key={dateStr}
                              type="button"
                              onClick={() => setSelectedDayFilter(dateStr)}
                              className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                                selectedDayFilter === dateStr
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "bg-muted hover:bg-muted/80 text-foreground"
                              }`}
                            >
                              <span>Day {idx + 1} ({dateStr})</span>
                              <span className="text-[10px] opacity-75 font-mono">({dayAssigned}/{dayCap})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Slot Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(selectedDayFilter === "all"
                  ? currentSchedule.slots
                  : currentSchedule.slots?.filter((s: any) => s.date === selectedDayFilter)
                )?.map((slot: any) => {
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
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h4 className="font-bold text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" /> Auto-Generate Multi-Day Slots
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-mono">Inclusive End Date</span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLoadThreeDayPreset}
                    className="w-full rounded-xl text-xs flex items-center justify-center gap-1.5 border-primary/30 text-primary bg-primary/5 hover:bg-primary/10"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> ⚡ 1-Click 3-Day Preset (28, 29, 30 Oct 2026; 2 Slots/Day)
                  </Button>

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
                <ShieldAlert className="w-5 h-5 text-primary" /> Assignment Management &amp; Bulk Access Overrides
              </h3>
              <p className="text-xs text-muted-foreground">
                Multi-select student assignments for bulk slot changes, access revocation, or reinstatement with authoritative audit tracking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search UID, Name, or Email..."
                value={assignmentSearch}
                onChange={(e) => setAssignmentSearch(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs w-full sm:w-48"
              />
              <select
                value={assignmentSlotFilter}
                onChange={(e) => setAssignmentSlotFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs"
              >
                <option value="">All Slots</option>
                {currentSchedule?.slots?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.slotCode})
                  </option>
                ))}
              </select>
              <select
                value={assignmentStatusFilter}
                onChange={(e) => setAssignmentStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs"
              >
                <option value="">All Statuses</option>
                <option value="assigned">Assigned</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="revoked">Revoked</option>
                <option value="exception">Exception</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Sticky Bulk Action Toolbar */}
          {selectedAssignmentIds.length > 0 && (
            <div className="sticky top-2 z-20 bg-primary/10 backdrop-blur-md border border-primary/30 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-lg">
                  Selected: {selectedAssignmentIds.length} unique students
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Select an action to apply across all checked assignments.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkChangeSlotModal({ isOpen: true, targetSlotId: "", reason: "", forceImmediate: false })}
                  className="rounded-xl h-8 text-xs font-semibold"
                >
                  Bulk Change Slot
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkRevokeModal({ isOpen: true, reason: "" })}
                  className="rounded-xl h-8 text-xs font-semibold text-rose-500 hover:text-rose-600 border-rose-500/30"
                >
                  Bulk Revoke Access
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkReinstateModal({ isOpen: true, targetSlotId: "", reason: "" })}
                  className="rounded-xl h-8 text-xs font-semibold text-emerald-500 hover:text-emerald-600 border-emerald-500/30"
                >
                  Bulk Reinstate Access
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearAssignmentSelection}
                  className="rounded-xl h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto bg-card border border-border rounded-2xl shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredAssignments.length > 0 &&
                        filteredAssignments.every((a) => selectedAssignmentIds.includes(a.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleSelectAllAssignmentsOnPage();
                        } else {
                          handleDeselectAllAssignmentsOnPage();
                        }
                      }}
                      className="w-4 h-4 rounded text-primary"
                    />
                  </th>
                  <th className="p-3">Student UID</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Academic Context</th>
                  <th className="p-3">Assigned Slot</th>
                  <th className="p-3">Date &amp; Time Window</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Individual Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAssignments.map((assignment) => {
                  const isChecked = selectedAssignmentIds.includes(assignment.id);
                  return (
                    <tr key={assignment.id} className={`hover:bg-muted/30 ${isChecked ? "bg-primary/5" : ""}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectAssignment(assignment.id)}
                          className="w-4 h-4 rounded text-primary"
                        />
                      </td>
                      <td className="p-3 font-mono font-semibold">{assignment.studentUid}</td>
                      <td className="p-3 font-medium">{assignment.studentName || assignment.academicSnapshot?.name || "-"}</td>
                      <td className="p-3 text-muted-foreground">
                        {assignment.academicSnapshot?.course || assignment.academicSnapshot?.department || "CSE"}{" "}
                        {assignment.academicSnapshot?.section ? `• Sec ${assignment.academicSnapshot.section}` : ""}
                      </td>
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
                              : assignment.status === "rescheduled"
                              ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
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
                  );
                })}
                {filteredAssignments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No assignments found matching the search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Modal for Bulk Revoke Access */}
          {bulkRevokeModal.isOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in-50">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="font-bold text-lg text-rose-500 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> Bulk Revoke Exam Access
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkRevokeModal({ isOpen: false, reason: "" })}
                    className="h-8 w-8 p-0"
                  >
                    ✕
                  </Button>
                </div>

                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs space-y-1">
                  <p className="font-semibold text-rose-500">
                    You are about to revoke exam access for {selectedAssignmentIds.length} students.
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Revoking access immediately blocks examination entry via backend authorization. Submissions and exam history will be preserved.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Mandatory Audit Reason *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Document the administrative justification for bulk revocation..."
                    value={bulkRevokeModal.reason}
                    onChange={(e) => setBulkRevokeModal((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-background border border-border text-xs focus:ring-2 focus:ring-rose-500 outline-hidden"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkRevokeModal({ isOpen: false, reason: "" })}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmBulkRevoke}
                    disabled={actionLoading || !bulkRevokeModal.reason.trim()}
                    className="rounded-xl text-xs bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    {actionLoading ? <Spinner /> : "Confirm Bulk Revocation"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Modal for Bulk Change Slot */}
          {bulkChangeSlotModal.isOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in-50">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" /> Bulk Move to Destination Slot
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkChangeSlotModal({ isOpen: false, targetSlotId: "", reason: "", forceImmediate: false })}
                    className="h-8 w-8 p-0"
                  >
                    ✕
                  </Button>
                </div>

                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs space-y-1">
                  <p className="font-semibold text-primary">
                    Moving {selectedAssignmentIds.length} students to a different exam slot.
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Access windows will be automatically recalculated according to the destination slot timetable.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Choose Destination Slot *
                  </label>
                  <select
                    value={bulkChangeSlotModal.targetSlotId}
                    onChange={(e) => setBulkChangeSlotModal((prev) => ({ ...prev, targetSlotId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                  >
                    <option value="">-- Select Destination Slot --</option>
                    {currentSchedule?.slots?.map((s: any) => {
                      const remaining = Math.max(0, s.capacity - (s.assignedCount || 0));
                      return (
                        <option key={s.id} value={s.id} disabled={remaining < selectedAssignmentIds.length}>
                          {s.name} ({s.date} {s.startTime}-{s.endTime}) — {remaining} seats left (Cap: {s.capacity})
                          {remaining < selectedAssignmentIds.length ? " [INSUFFICIENT CAPACITY]" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Administrative Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Document reason for slot move..."
                    value={bulkChangeSlotModal.reason}
                    onChange={(e) => setBulkChangeSlotModal((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-background border border-border text-xs"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={bulkChangeSlotModal.forceImmediate}
                    onChange={(e) => setBulkChangeSlotModal((prev) => ({ ...prev, forceImmediate: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded text-primary"
                  />
                  <span>Force move even if students have in-progress attempts (advanced exception)</span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkChangeSlotModal({ isOpen: false, targetSlotId: "", reason: "", forceImmediate: false })}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmBulkChangeSlot}
                    disabled={actionLoading || !bulkChangeSlotModal.targetSlotId}
                    className="rounded-xl text-xs bg-primary"
                  >
                    {actionLoading ? <Spinner /> : "Confirm Reassignment"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Modal for Bulk Reinstate Access */}
          {bulkReinstateModal.isOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in-50">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="font-bold text-lg text-emerald-600 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" /> Bulk Reinstate Exam Access
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkReinstateModal({ isOpen: false, targetSlotId: "", reason: "" })}
                    className="h-8 w-8 p-0"
                  >
                    ✕
                  </Button>
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs">
                  <p className="font-semibold text-emerald-600">
                    Reinstating exam eligibility for {selectedAssignmentIds.length} students.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Target Slot (Optional - leave blank to keep original slot)
                  </label>
                  <select
                    value={bulkReinstateModal.targetSlotId}
                    onChange={(e) => setBulkReinstateModal((prev) => ({ ...prev, targetSlotId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs"
                  >
                    <option value="">-- Preserve Original Slot --</option>
                    {currentSchedule?.slots?.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.date} {s.startTime}-{s.endTime})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Mandatory Audit Reason *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Document the administrative justification for reinstating access..."
                    value={bulkReinstateModal.reason}
                    onChange={(e) => setBulkReinstateModal((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-2.5 rounded-xl bg-background border border-border text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkReinstateModal({ isOpen: false, targetSlotId: "", reason: "" })}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmBulkReinstate}
                    disabled={actionLoading || !bulkReinstateModal.reason.trim()}
                    className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {actionLoading ? <Spinner /> : "Confirm Reinstatement"}
                  </Button>
                </div>
              </div>
            </div>
          )}

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
