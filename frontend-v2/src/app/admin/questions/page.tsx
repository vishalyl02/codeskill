"use client";

import { getQuestionTypeLabel, getTopicCategories } from "@/lib/question-types";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminQuestionsAPI, adminQuestionBanksAPI, adminProblemsAPI } from "@/config/api";
import Link from "next/link";
import { VTable3 } from "@/components/ui/v-table-3";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { 
  Plus, 
  Search, 
  Trash2, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  BookOpen, 
  Layers, 
  Sparkles, 
  ShieldCheck, 
  Code, 
  Filter, 
  FolderPlus,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  RefreshCw,
  X
} from "lucide-react";

export default function QuestionsAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"questions" | "banks" | "coding">("questions");
  const containerRef = useRef<HTMLDivElement>(null);

  // Questions State
  const [questions, setQuestions] = useState<any[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [topicsList, setTopicsList] = useState<any[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [deletingQuestions, setDeletingQuestions] = useState(false);

  // Modals & Inspect
  const [inspectQuestion, setInspectQuestion] = useState<any | null>(null);

  useGSAP(() => {
    try {
      if (typeof window === "undefined" || !containerRef.current) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline();
        tl.from(".page-header", { opacity: 0, y: -15, duration: 0.4 })
          .from(".tab-button", { opacity: 0, x: -10, stagger: 0.05, duration: 0.3 }, "-=0.2");
      });
    } catch (_) {}
  }, { scope: containerRef });

  useGSAP(() => {
    if (inspectQuestion) {
      try {
        if (typeof window === "undefined" || !containerRef.current) return;
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          const tl = gsap.timeline();
          tl.from(".modal-backdrop", { opacity: 0, duration: 0.2 })
            .from(".modal-box", { scale: 0.96, opacity: 0, duration: 0.2, ease: "power2.out" }, "-=0.1")
            .from(".modal-header", { y: -10, opacity: 0, duration: 0.2 }, "-=0.1")
            .from(".modal-security", { opacity: 0, duration: 0.2 }, "-=0.1")
            .from(".modal-question", { y: 10, opacity: 0, duration: 0.2 }, "-=0.1")
            .from(".modal-option", { x: -10, opacity: 0, stagger: 0.05, duration: 0.2 }, "-=0.1")
            .from(".modal-explanation", { y: 10, opacity: 0, duration: 0.2 }, "-=0.1")
            .from(".modal-footer", { y: 10, opacity: 0, duration: 0.2 }, "-=0.1");
        });
      } catch (_) {}
    }
  }, { scope: containerRef, dependencies: [inspectQuestion] });

  const handleCloseModal = () => {
    gsap.to(".modal-box", { scale: 0.96, opacity: 0, duration: 0.2, ease: "power2.in" });
    gsap.to(".modal-backdrop", { opacity: 0, duration: 0.2, onComplete: () => setInspectQuestion(null) });
  };
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [createBankModal, setCreateBankModal] = useState(false);
  const [newBank, setNewBank] = useState({ name: "", topic: "", description: "", difficulty: "medium" });

  // Question Banks State
  const [banks, setBanks] = useState<any[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);

  // Coding Problems State
  const [codingProblems, setCodingProblems] = useState<any[]>([]);
  const [loadingCoding, setLoadingCoding] = useState(false);

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    if (activeTab === "questions") {
      fetchQuestions();
    } else if (activeTab === "banks") {
      fetchBanks();
    } else if (activeTab === "coding") {
      fetchCodingProblems();
    }
  }, [activeTab, page, selectedTopic, selectedDifficulty, selectedType, selectedStatus]);

  const fetchTopics = async () => {
    try {
      const res = await adminQuestionsAPI.getTopics();
      const list = Array.isArray(res.data?.topics)
        ? res.data.topics
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setTopicsList(list);
    } catch (err) {
      console.error("Failed to fetch topics distribution", err);
      setTopicsList([]);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const res = await adminQuestionsAPI.getAll({
        page,
        limit: 15,
        search: search || undefined,
        topic: selectedTopic || undefined,
        difficulty: selectedDifficulty || undefined,
        questionType: selectedType || undefined,
        status: selectedStatus || undefined,
      });
      const rawList = Array.isArray(res.data?.questions)
        ? res.data.questions
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setQuestions(rawList);
      setTotalQuestions(res.data?.pagination?.total ?? res.data?.total ?? rawList.length);
      setTotalPages(res.data?.pagination?.totalPages ?? res.data?.totalPages ?? 1);
    } catch (err) {
      console.error("Failed to fetch questions", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBanks = async () => {
    setLoadingBanks(true);
    try {
      const res = await adminQuestionBanksAPI.getAll();
      const list = Array.isArray(res.data?.banks)
        ? res.data.banks
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setBanks(list);
    } catch (err) {
      console.error("Failed to fetch question banks", err);
      setBanks([]);
    } finally {
      setLoadingBanks(false);
    }
  };

  const fetchCodingProblems = async () => {
    setLoadingCoding(true);
    try {
      const res = await adminProblemsAPI.getAll();
      const list = Array.isArray(res.data?.problems)
        ? res.data.problems
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setCodingProblems(list);
    } catch (err) {
      console.error("Failed to fetch coding problems", err);
      setCodingProblems([]);
    } finally {
      setLoadingCoding(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedQuestionIds([]);
    setPage(1);
    fetchQuestions();
  };

  const handleClearFilters = () => {
    setSelectedQuestionIds([]);
    setSearch("");
    setSelectedTopic("");
    setSelectedDifficulty("");
    setSelectedType("");
    setSelectedStatus("");
    setPage(1);
  };

  const handleApprove = async (id: string) => {
    try {
      await adminQuestionsAPI.approve(id);
      fetchQuestions();
      const currentId = inspectQuestion?._id || inspectQuestion?.id;
      if (currentId === id) {
        setInspectQuestion((prev: any) => ({ ...prev, status: "approved" }));
      }
    } catch (err) {
      console.error("Failed to approve question", err);
      alert("Failed to approve question");
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalId) return;
    try {
      await adminQuestionsAPI.reject(rejectModalId, rejectionReason);
      setRejectModalId(null);
      setRejectionReason("");
      fetchQuestions();
      const currentId = inspectQuestion?._id || inspectQuestion?.id;
      if (currentId === rejectModalId) {
        setInspectQuestion((prev: any) => ({ ...prev, status: "rejected", rejectionReason }));
      }
    } catch (err) {
      console.error("Failed to reject question", err);
      alert("Failed to reject question");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Archive this assessment question? Archived questions are removed from the active question bank.")) return;
    try {
      await adminQuestionsAPI.delete(id);
      fetchQuestions();
      setSelectedQuestionIds((current) => current.filter((selectedId) => selectedId !== id));
      const currentId = inspectQuestion?._id || inspectQuestion?.id;
      if (currentId === id) setInspectQuestion(null);
    } catch (err) {
      console.error("Failed to delete question", err);
      alert("Failed to archive question. Please try again.");
    }
  };

  const handleToggleQuestion = (id: string) => {
    setSelectedQuestionIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  };

  const handleTogglePage = () => {
    const visibleIds = questions.map((question) => String(question._id || question.id || "")).filter(Boolean);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedQuestionIds.includes(id));
    setSelectedQuestionIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedQuestionIds];
    if (ids.length === 0 || deletingQuestions) return;
    if (!confirm(`Archive ${ids.length} selected question${ids.length === 1 ? "" : "s"}? They will be removed from the active question bank.`)) return;

    setDeletingQuestions(true);
    const failedIds: string[] = [];
    try {
      for (const id of ids) {
        try {
          await adminQuestionsAPI.delete(id);
        } catch (error) {
          console.error(`Failed to archive question ${id}`, error);
          failedIds.push(id);
        }
      }
      setSelectedQuestionIds(failedIds);
      await fetchQuestions();
      if (failedIds.length > 0) {
        alert(`${ids.length - failedIds.length} question${ids.length - failedIds.length === 1 ? "" : "s"} archived. ${failedIds.length} could not be archived and remain selected.`);
      }
    } finally {
      setDeletingQuestions(false);
    }
  };

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminQuestionBanksAPI.create(newBank);
      setCreateBankModal(false);
      setNewBank({ name: "", topic: "", description: "", difficulty: "medium" });
      fetchBanks();
    } catch (err) {
      console.error("Failed to create bank", err);
      alert("Failed to create question bank");
    }
  };

  // Metrics calculations
  const pendingCount = (questions || []).filter(q => q && q.status === "pending_review").length;
  const activeCount = (questions || []).filter(q => q && (q.status === "active" || q.status === "approved")).length;

  return (
    <div ref={containerRef} className="p-8 font-sans max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 page-header">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Question Bank</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              Assessment v2.0
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Standardized university assessment repository with leak-prevention & automated options verification.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/questions/pending"
            className="inline-flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground border border-border px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Clock className="w-4 h-4 text-primary" />
            Review Queue
          </Link>
          <Link
            href="/admin/questions/create"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold shadow-md shadow-primary/20 transition-all hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            Create Question
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Questions</span>
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground mt-2 font-mono">{totalQuestions}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            Across all topics & courses
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active in Pool</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-500 mt-2 font-mono">{activeCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Ready for assessment assembly</div>
        </div>

        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending Review</span>
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-primary mt-2 font-mono">{pendingCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Requires faculty validation</div>
        </div>

        <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Indexed Topics</span>
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground mt-2 font-mono">{topicsList.length}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <Link href="/admin/questions/topics" className="text-primary hover:underline">
              View distribution &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-6">
        <button
          onClick={() => { setSelectedQuestionIds([]); setActiveTab("questions"); }}
          className={`tab-button pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "questions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Assessment Questions
          <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-mono">
            {totalQuestions}
          </span>
        </button>

        <button
          onClick={() => { setSelectedQuestionIds([]); setActiveTab("banks"); }}
          className={`tab-button pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "banks"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="w-4 h-4" />
          Question Banks (Collections)
          <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-mono">
            {banks.length}
          </span>
        </button>

        <button
          onClick={() => { setSelectedQuestionIds([]); setActiveTab("coding"); }}
          className={`tab-button pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "coding"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code className="w-4 h-4" />
          Algorithmic Challenges
          <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-mono">
            {codingProblems.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Assessment Questions */}
      {activeTab === "questions" && (
        <VTable3
          questions={questions}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          selectedTopic={selectedTopic}
          onTopicChange={(val) => { setSelectedQuestionIds([]); setSelectedTopic(val); setPage(1); }}
          selectedDifficulty={selectedDifficulty}
          onDifficultyChange={(val) => { setSelectedQuestionIds([]); setSelectedDifficulty(val); setPage(1); }}
          selectedType={selectedType}
          onTypeChange={(val) => { setSelectedQuestionIds([]); setSelectedType(val); setPage(1); }}
          selectedStatus={selectedStatus}
          onStatusChange={(val) => { setSelectedQuestionIds([]); setSelectedStatus(val); setPage(1); }}
          topicsList={topicsList}
          onSearchSubmit={handleSearchSubmit}
          onClearFilters={handleClearFilters}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onView={setInspectQuestion}
          onEdit={(id) => router.push(`/admin/questions/${id}/edit`)}
          onApprove={handleApprove}
          onReject={setRejectModalId}
          onDelete={handleDelete}
          selectedQuestionIds={selectedQuestionIds}
          onToggleQuestion={handleToggleQuestion}
          onTogglePage={handleTogglePage}
          onBulkDelete={handleBulkDelete}
          deletingQuestions={deletingQuestions}
        />
      )}

      {/* Tab 2: Question Banks (Collections) */}
      {activeTab === "banks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Collections group curated assessment questions for designated semester exams and departmental evaluations.
            </p>
            <button
              onClick={() => setCreateBankModal(true)}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New Collection
            </button>
          </div>

          {loadingBanks ? (
            <div className="p-12 text-center text-muted-foreground bg-card border border-border rounded-xl">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-amber-500 mb-2" />
              Loading question banks...
            </div>
          ) : !Array.isArray(banks) || banks.length === 0 ? (
            <div className="p-12 text-center bg-card border border-border rounded-xl">
              <Layers className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-foreground font-semibold">No Question Banks Created Yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Organize your assessment questions into named collections for universities and courses.
              </p>
              <button
                onClick={() => setCreateBankModal(true)}
                className="bg-amber-500 text-zinc-950 px-3.5 py-1.5 rounded-lg text-xs font-semibold"
              >
                Create Collection
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.isArray(banks) && banks.map((bank) => (
                <div key={bank._id || bank.id || Math.random()} className="bg-card border border-border p-5 rounded-xl hover:border-amber-500/40 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground text-base">{bank.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 capitalize">
                        {bank.difficulty || "mixed"}
                      </span>
                    </div>
                    <span className="inline-block mt-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                      {bank.topic}
                    </span>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {bank.description || "No description provided."}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>{bank.questions?.length || 0} Questions</span>
                    <span className="font-mono">{new Date(bank.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Algorithmic Coding Challenges */}
      {activeTab === "coding" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Algorithmic Problem Catalog</span>
            <Link
              href="/admin/questions/create"
              className="text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-md font-medium"
            >
              + Create Coding Problem
            </Link>
          </div>
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border font-medium">
              <tr>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Difficulty</th>
                <th className="px-6 py-3">Visibility</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.isArray(codingProblems) && codingProblems.map((prob) => (
                <tr key={prob._id || prob.id || Math.random()} className="hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium text-foreground">
                    <Link href={`/problems/${prob.slug}`} target="_blank" className="hover:underline flex items-center gap-1.5">
                      {prob.title}
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-xs font-semibold">{prob.difficulty}</span>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {prob.visibility || "Published"}
                  </td>
                  <td className="px-6 py-4 text-xs font-mono">
                    {new Date(prob.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Question Details / Inspection Modal */}
      {inspectQuestion && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto transition-all">
          <div className="modal-box bg-white border border-slate-200 rounded-[20px] w-full max-w-[900px] shadow-2xl flex flex-col my-auto max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="modal-header px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-start justify-between gap-4 shrink-0 bg-white rounded-t-[20px]">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">Question Preview</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-medium text-slate-500">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">Topic: {getTopicCategories(inspectQuestion).join(', ') || 'General'}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">Type: {getQuestionTypeLabel(inspectQuestion.questionType)}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 capitalize">Difficulty: {inspectQuestion.difficulty || 'Easy'}</span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-semibold">Marks: {inspectQuestion.marks || 1}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 btn-interactive"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
              
              {/* Security Banner */}
              <div className="modal-security bg-emerald-50 border border-emerald-200/60 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">Leak Prevention Active</div>
                    <div className="text-xs text-emerald-700 mt-0.5">Correct answer and explanation are hidden from student session payloads.</div>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-md bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-800 tracking-wider">
                  SAFE MODE
                </div>
              </div>

              {/* Rejection Notice */}
              {inspectQuestion.status === "rejected" && inspectQuestion.rejectionReason && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 shadow-sm">
                  <div className="text-sm font-semibold text-rose-900 flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Rejection Reason
                  </div>
                  <p className="text-xs text-rose-700">{inspectQuestion.rejectionReason}</p>
                </div>
              )}

              {/* Question Statement */}
              <section className="modal-question">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Question</h4>
                <div className="bg-white border border-slate-200 p-5 rounded-[12px] shadow-sm">
                  <div className="text-[15px] text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                    {inspectQuestion.question}
                  </div>
                  
                  {/* Code Snippet if present */}
                  {inspectQuestion.codeSnippet && (
                    <div className="mt-4">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{inspectQuestion.language || "Code"}</div>
                      <pre className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-[13px] font-mono text-slate-50 overflow-x-auto">
                        <code>{inspectQuestion.codeSnippet}</code>
                      </pre>
                    </div>
                  )}
                </div>
              </section>

              {/* Answer Options */}
              {inspectQuestion.options && inspectQuestion.options.length > 0 && (
                <section>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Answer Options</h4>
                  <div className="grid gap-3">
                    {inspectQuestion.options.map((opt: any, idx: number) => {
                      const optionText = typeof opt === "string" ? opt : opt?.text || "";
                      const optionExplanation = typeof opt === "object" ? opt?.explanation : null;
                      const isCorrect = typeof opt === "object" && opt?.isCorrect !== undefined
                        ? Boolean(opt.isCorrect)
                        : (inspectQuestion.correctAnswer === idx || (Array.isArray(inspectQuestion.correctAnswers) && inspectQuestion.correctAnswers.includes(idx)));
                      return (
                        <div
                          key={idx}
                          className={`modal-option relative p-4 rounded-[12px] border transition-all flex items-start gap-4 ${
                            isCorrect
                              ? "bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-500/20 shadow-sm"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${
                              isCorrect
                                ? "bg-emerald-500 text-white shadow-sm"
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <div className="flex-1 pt-1">
                            <div className={`text-[15px] font-medium leading-snug ${isCorrect ? 'text-emerald-950' : 'text-slate-800'}`}>
                              {optionText}
                            </div>
                            {optionExplanation && (
                              <div className="text-xs text-slate-500 mt-2 bg-slate-50 p-2 rounded-md border border-slate-100">
                                {optionExplanation}
                              </div>
                            )}
                          </div>
                          {isCorrect && (
                            <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* General Explanation */}
              {inspectQuestion.explanation && (
                <section className="modal-explanation">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Explanation & Reference</h4>
                  <div className="bg-slate-100/80 border border-slate-200 p-5 rounded-[12px]">
                    <div className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {inspectQuestion.explanation}
                    </div>
                  </div>
                </section>
              )}

            </div>

            {/* Modal Footer */}
            <div className="modal-footer px-6 py-4 border-t border-slate-100 bg-white rounded-b-[20px] flex items-center justify-between shrink-0">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Scoring</span>
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {inspectQuestion.marks || 1} mark{inspectQuestion.marks !== 1 ? 's' : ''}
                  </span>
                  {(inspectQuestion.negativeMarks > 0) && (
                    <span className="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                      -{inspectQuestion.negativeMarks} penalty
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {inspectQuestion.status === "pending_review" && (
                  <>
                    <button
                      onClick={() => {
                        setRejectModalId(inspectQuestion._id || inspectQuestion.id);
                      }}
                      className="px-4 py-2 rounded-xl bg-white text-rose-600 border border-rose-200 font-semibold text-sm hover:bg-rose-50 transition-colors shadow-sm"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(inspectQuestion._id || inspectQuestion.id)}
                      className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      Approve
                    </button>
                  </>
                )}
                
                <Link
                  href={`/admin/questions/${inspectQuestion._id || inspectQuestion.id}/edit`}
                  className="px-4 py-2 rounded-xl bg-white text-slate-700 border border-slate-200 font-semibold text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                >
                  Edit Question
                </Link>

                <button
                  onClick={handleCloseModal}
                  className="px-6 py-2 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition-all shadow-sm shadow-amber-500/20 btn-interactive"
                >
                  Close
                </button>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-border rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-foreground text-base">Reject Assessment Question</h3>
            <p className="text-xs text-muted-foreground">
              Provide feedback for the question author describing why this question does not meet university assessment standards.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Ambiguous answer options, incorrect code snippet syntax, or missing topic tags."
              className="w-full p-3 bg-zinc-900 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectModalId(null)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                className="px-4 py-1.5 text-xs font-semibold bg-rose-500 text-white rounded-lg hover:bg-rose-600"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Question Bank Modal */}
      {createBankModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBank} className="bg-zinc-950 border border-border rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-foreground text-base">Create Question Bank Collection</h3>
            <p className="text-xs text-muted-foreground">
              Collections group questions by course curriculum or difficulty for university exams.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Collection Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Data Structures & Algorithms - Endsem 2026"
                  value={newBank.name}
                  onChange={(e) => setNewBank({ ...newBank, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Topic</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Data Structures"
                  value={newBank.topic}
                  onChange={(e) => setNewBank({ ...newBank, topic: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Difficulty Level</label>
                <select
                  value={newBank.difficulty}
                  onChange={(e) => setNewBank({ ...newBank, difficulty: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or syllabus scope..."
                  value={newBank.description}
                  onChange={(e) => setNewBank({ ...newBank, description: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateBankModal(false)}
                className="px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-amber-500 text-zinc-950 rounded-lg hover:bg-amber-400"
              >
                Save Collection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
