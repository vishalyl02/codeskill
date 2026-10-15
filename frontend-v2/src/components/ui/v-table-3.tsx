"use client";

import { getQuestionTypeLabel, getTopicCategories, QUESTION_TYPES } from "@/lib/question-types";

import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MoreVertical, 
  Eye, 
  CheckCircle2, 
  XCircle,
  Search,
  FilterX,
  Trash2,
  Code,
  Sparkles,
  BookOpen,
  Plus
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import Link from "next/link";


interface VTable3Props {
  questions: any[];
  loading: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  selectedTopic: string;
  onTopicChange: (val: string) => void;
  selectedDifficulty: string;
  onDifficultyChange: (val: string) => void;
  selectedType: string;
  onTypeChange: (val: string) => void;
  selectedStatus: string;
  onStatusChange: (val: string) => void;
  topicsList: any[];
  onSearchSubmit: (e: React.FormEvent) => void;
  onClearFilters: () => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onView: (q: any) => void;
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  selectedQuestionIds: string[];
  onToggleQuestion: (id: string) => void;
  onTogglePage: () => void;
  onBulkDelete: () => void;
  deletingQuestions: boolean;
}

export function VTable3({
  questions,
  loading,
  search,
  onSearchChange,
  selectedTopic,
  onTopicChange,
  selectedDifficulty,
  onDifficultyChange,
  selectedType,
  onTypeChange,
  selectedStatus,
  onStatusChange,
  topicsList,
  onSearchSubmit,
  onClearFilters,
  page,
  totalPages,
  onPageChange,
  onView,
  onEdit,
  onApprove,
  onReject,
  onDelete,
  selectedQuestionIds,
  onToggleQuestion,
  onTogglePage,
  onBulkDelete,
  deletingQuestions,
}: VTable3Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    try {
      if (typeof window === "undefined" || !containerRef.current) return;
      if (!loading && questions.length > 0) {
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          gsap.from(".question-row", {
            opacity: 0,
            y: 8,
            stagger: 0.03,
            duration: 0.3
          });
        });
      }
    } catch (_) {}
  }, { scope: containerRef, dependencies: [questions, loading] });

  const hasFilters = Boolean(search || selectedTopic || selectedDifficulty || selectedType || selectedStatus);
  const visibleIds = questions.map((q) => String(q._id || q.id || "")).filter(Boolean);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedQuestionIds.includes(id));

  const getDifficultyColor = (diff: string) => {
    switch (diff?.toLowerCase()) {
      case "easy": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "medium": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "hard": return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "pending_review": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "draft": return "bg-slate-500/10 text-slate-600 border-slate-500/20";
      case "rejected": return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      case "archived": return "bg-zinc-500/10 text-zinc-600 border-zinc-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };



  return (
    <div ref={containerRef} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col space-y-0 w-full">
      {/* Header & Filters */}
      <div className="p-5 border-b border-border bg-muted/20 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Questions</h2>
            <p className="text-sm text-muted-foreground">Manage and organize your coding assessment questions.</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedQuestionIds.length > 0 && (
              <button
                type="button"
                onClick={onBulkDelete}
                disabled={deletingQuestions}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {deletingQuestions ? "Deleting…" : `Delete selected (${selectedQuestionIds.length})`}
              </button>
            )}
            <Link
              href="/admin/questions/create"
              className="inline-flex items-center gap-2 bg-amber-500 text-zinc-950 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Question
            </Link>
          </div>
        </div>

        <form onSubmit={onSearchSubmit} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-foreground transition-all"
            />
          </div>

          <select
            value={selectedTopic}
            onChange={(e) => onTopicChange(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
          >
            <option value="">All Topics</option>
            {Array.isArray(topicsList) && topicsList.map((t) => (
              <option key={t.topic} value={t.topic}>
                {t.topic} ({t.total})
              </option>
            ))}
          </select>

          <select
            value={selectedDifficulty}
            onChange={(e) => onDifficultyChange(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
          >
            <option value="">All Types</option>
            {QUESTION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending_review">Pending Review</option>
            <option value="draft">Draft</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors"
          >
            Filter
          </button>
          
          {hasFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="px-3 py-2 flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg text-sm font-medium transition-colors"
            >
              <FilterX className="w-4 h-4" />
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table Section */}
      <div className="w-full overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  aria-label="Select all questions on this page"
                  checked={allVisibleSelected}
                  onChange={onTogglePage}
                  disabled={loading || visibleIds.length === 0}
                  className="h-4 w-4 cursor-pointer rounded border-border accent-rose-500 disabled:cursor-not-allowed"
                />
              </TableHead>
              <TableHead className="w-[30%]">Question</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Marks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-full max-w-[300px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-10" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : questions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-[300px] text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                      <BookOpen className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1">
                      {hasFilters ? "No matching questions" : "No questions found"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                      {hasFilters 
                        ? "Try adjusting your filters or clearing them to see more results."
                        : "Get started by creating your first assessment question."}
                    </p>
                    {hasFilters ? (
                      <button
                        onClick={onClearFilters}
                        className="text-sm font-medium text-amber-500 hover:text-amber-600"
                      >
                        Clear Filters
                      </button>
                    ) : (
                      <Link
                        href="/admin/questions/create"
                        className="inline-flex items-center gap-2 bg-amber-500 text-zinc-950 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Create Question
                      </Link>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              (questions || []).map((q) => {
                const qId = q._id || q.id || "";
                const shortId = qId ? qId.slice(-6).toUpperCase() : "QST";
                const statusStr = (q.status || "active").replace("_", " ");

                return (
                  <TableRow key={qId || Math.random()} className="question-row group hover:bg-muted/20">
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${q.question || q.title || "question"}`}
                        checked={selectedQuestionIds.includes(qId)}
                        onChange={() => onToggleQuestion(qId)}
                        className="h-4 w-4 cursor-pointer rounded border-border accent-rose-500"
                      />
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium text-foreground truncate" title={q.question || q.title}>
                          {q.question || q.title}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-mono">Q-{shortId}</span>
                          {q.codeSnippet && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                              <Code className="w-2.5 h-2.5 text-amber-500" />
                              {q.language || "code"}
                            </span>
                          )}
                          {q.aiGenerated && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 px-1.5 py-0.5 rounded text-purple-500 border border-purple-500/20">
                              <Sparkles className="w-2.5 h-2.5" />
                              AI
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-medium bg-background text-muted-foreground border-border rounded-md">
                        {getQuestionTypeLabel(q.questionType)}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">{getTopicCategories(q).join(", ") || "General"}</span>
                        {q.subtopic && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{q.subtopic}</span>}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] font-medium capitalize rounded-md ${getDifficultyColor(q.difficulty)}`}>
                        {q.difficulty || "medium"}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-emerald-500 font-semibold">+{q.marks || 1}</span>
                        {q.negativeMarks > 0 && <span className="text-rose-500">-{q.negativeMarks}</span>}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] font-medium capitalize rounded-md ${getStatusColor(q.status)}`}>
                        {statusStr}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {q.updatedAt ? new Date(q.updatedAt).toLocaleDateString() : "-"}
                      </span>
                    </TableCell>
                    
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-2 hover:bg-muted rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/20">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onView(q)} className="cursor-pointer gap-2 text-sm focus:bg-muted">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              View Preview
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator className="bg-border" />
                          {q.status === "pending_review" && (
                            <>
                              <DropdownMenuGroup>
                                <DropdownMenuItem onClick={() => onApprove(qId)} className="cursor-pointer gap-2 text-sm focus:bg-emerald-500/10 focus:text-emerald-500 text-emerald-600">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onReject(qId)} className="cursor-pointer gap-2 text-sm focus:bg-rose-500/10 focus:text-rose-500 text-rose-600">
                                  <XCircle className="w-4 h-4" />
                                  Reject
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                              <DropdownMenuSeparator className="bg-border" />
                            </>
                          )}
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => onEdit(qId)} className="cursor-pointer gap-2 text-sm focus:bg-muted">
                              <Plus className="w-4 h-4 text-muted-foreground" />
                              Edit Question
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(qId)} className="cursor-pointer gap-2 text-sm text-rose-600 focus:bg-rose-500/10 focus:text-rose-600">
                              <Trash2 className="w-4 h-4" />
                              Delete Question
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {!loading && questions.length > 0 && (
        <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing page <span className="font-semibold text-foreground">{page}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
            {selectedQuestionIds.length > 0 && <span className="ml-3 text-rose-600">{selectedQuestionIds.length} selected</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
