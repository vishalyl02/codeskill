"use client";

import { useState, useEffect } from "react";
import { Search, X, Check, Filter, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { adminQuestionsAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { useAssessmentStore } from "../_store/useAssessmentStore";

interface QuestionPickerProps {
  sectionId: string;
  onClose: () => void;
}

interface PickerQuestion {
  _id: string;
  question: string;
  questionType?: string;
  difficulty?: string;
  marks?: number;
  negativeMarks?: number;
  topic?: string;
}

export default function QuestionPicker({ sectionId, onClose }: QuestionPickerProps) {
  const store = useAssessmentStore();
  const [questions, setQuestions] = useState<Array<{
    _id: string;
    question: string;
    questionType?: string;
    difficulty?: string;
    marks?: number;
    negativeMarks?: number;
    topic?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // To avoid duplicate adds, get existing ones across the entire assessment
  const section = store.sections.find(s => s.id === sectionId);
  const existingIds = new Set(section?.questions.map(q => q.questionId) || []);
  const allSelectedInAssessment = new Set(store.sections.flatMap(s => s.questions.map(q => q.questionId)));

  const [selectedQuestions, setSelectedQuestions] = useState<Map<string, PickerQuestion>>(new Map());

  useEffect(() => {
    let active = true;
    adminQuestionsAPI.getTopics()
      .then(({ data }) => {
        if (!active) return;
        const rows = data?.topics || data?.data || [];
        const approvedSubjects: string[] = rows
          .filter((row: { topic?: string; approved?: number }) => Number(row.approved) > 0)
          .map((row: { topic?: string }) => row.topic)
          .filter((topic: string | undefined): topic is string => Boolean(topic));
        setSubjects([...new Set(approvedSubjects)].sort());
      })
      .catch((err) => console.error(err));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!subjectFilter) return;

    let active = true;
    const fetchTopics = async () => {
      try {
        const { data } = await adminQuestionsAPI.getTopics(subjectFilter);
        if (!active) return;
        const rows = data?.topics || data?.data || [];
        const availableTopics: string[] = rows
          .map((row: string | { topic?: string }) => typeof row === "string" ? row : row.topic)
          .filter((topic: string | undefined): topic is string => Boolean(topic));
        setTopics([...new Set(availableTopics)].sort());
      } catch (err) {
        if (active) console.error(err);
      }
    };
    fetchTopics();
    return () => { active = false; };
  }, [subjectFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchQ = async () => {
      setLoading(true);
      try {
        const res = await adminQuestionsAPI.getAll({
          page,
          limit: 25,
          status: "approved",
          search: search || undefined,
          questionType: typeFilter || undefined,
          topic: subjectFilter || undefined,
          subtopic: topicFilter || undefined,
          difficulty: difficultyFilter || undefined,
        }, controller.signal);
        setQuestions(res.data.questions || []);
        setTotalPages(res.data.pagination?.totalPages || 1);
      } catch (err) {
        if (!controller.signal.aborted) console.error(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchQ();
    return () => controller.abort();
  }, [search, typeFilter, subjectFilter, topicFilter, difficultyFilter, page]);

  const toggleSelect = (q: {
    _id: string;
    question: string;
    questionType?: string;
    difficulty?: string;
    marks?: number;
    negativeMarks?: number;
    topic?: string;
  }) => {
    if (existingIds.has(q._id)) return; // Already in section
    if (allSelectedInAssessment.has(q._id)) return; // Already selected elsewhere in the assessment

    const newSelection = new Map(selectedQuestions);
    if (newSelection.has(q._id)) {
      newSelection.delete(q._id);
    } else {
      newSelection.set(q._id, q);
    }
    setSelectedQuestions(newSelection);
  };

  const handleAdd = () => {
    selectedQuestions.forEach(q => {
      if (q) {
        store.addQuestionToSection(sectionId, {
          questionId: q._id,
          marks: q.marks || 1,
          negativeMarks: q.negativeMarks || 0,
          order: section?.questions.length || 0,
          topic: q.topic,
          difficulty: q.difficulty,
          questionText: q.question,
          questionType: q.questionType
        });
      }
    });
    onClose();
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setSubjectFilter("");
    setTopicFilter("");
    setDifficultyFilter("");
    setPage(1);
  };

  const hasFilters = Boolean(search || typeFilter || subjectFilter || topicFilter || difficultyFilter);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-lg font-bold text-foreground">Add Questions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select questions to add to {section?.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 border-b border-border bg-card flex flex-wrap gap-3 items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search questions..."
              aria-label="Search questions"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            aria-label="Subject"
            value={subjectFilter}
            onChange={e => {
              setSubjectFilter(e.target.value);
              setTopicFilter("");
              setTopics([]);
              setPage(1);
            }}
            className="px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Subjects</option>
            {subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
          </select>
          <select
            aria-label="Topic"
            value={topicFilter}
            onChange={e => { setTopicFilter(e.target.value); setPage(1); }}
            disabled={!subjectFilter}
            className="px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">All Topics</option>
            {topics.map(topic => <option key={topic} value={topic}>{topic}</option>)}
          </select>
          <select
            aria-label="Difficulty Level"
            value={difficultyFilter}
            onChange={e => { setDifficultyFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <select
            aria-label="Question type"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Types</option>
            <option value="MCQ">MCQ</option>
            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
            <option value="CODE_OUTPUT">Code Output</option>
            <option value="DSA">DSA</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" />Clear filters
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 bg-muted/10">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
              <Filter className="w-8 h-8 mb-2 opacity-50" />
              No questions found
            </div>
          ) : (
            <div className="space-y-1.5 p-3">
              {questions.map(q => {
                const isExisting = existingIds.has(q._id);
                const isSelected = selectedQuestions.has(q._id);
                const isDuplicateAcrossAssessment = allSelectedInAssessment.has(q._id) && !isExisting;
                return (
                  <div
                    key={q._id}
                    onClick={() => toggleSelect(q)}
                    className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${isExisting || isDuplicateAcrossAssessment
                        ? 'opacity-50 cursor-not-allowed bg-muted/50 border-border'
                        : isSelected
                          ? 'bg-primary/5 border-primary/30 cursor-pointer'
                          : 'bg-card border-border hover:border-primary/30 cursor-pointer'
                      }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border ${isExisting || isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-muted'
                      }`}>
                      {(isExisting || isSelected) && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 bg-muted border border-border rounded text-[10px] font-bold text-foreground uppercase">
                          {q.questionType || 'MCQ'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${q.difficulty === 'easy' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                            q.difficulty === 'medium' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                              'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          }`}>
                          {q.difficulty}
                        </span>
                        <span className="ml-auto text-xs font-mono font-medium text-muted-foreground">
                          {q.marks || 1} pts
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground line-clamp-2 leading-relaxed">
                        {q.question}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border bg-card flex justify-between items-center">
          <span className="text-sm font-semibold text-muted-foreground">
            {selectedQuestions.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous questions page"
              onClick={() => setPage(current => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <button
              type="button"
              aria-label="Next questions page"
              onClick={() => setPage(current => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
              className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedQuestions.size === 0}
              className="px-6 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              Add to Section
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
