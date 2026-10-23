"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  BookOpen,
  Layers,
  FileText,
  CheckSquare,
  Plus,
  Trash2,
  Edit3,
  Save,
  ArrowLeft,
  Check,
  Sparkles,
  Code,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  HelpCircle,
  Clock,
  Award,
  X,
} from "lucide-react";
import { adminLearningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface ExerciseItem {
  id: string;
  title: string;
  type: "quiz" | "coding";
  marks: number;
  quizConfig?: {
    questions: Array<{
      id: string;
      question: string;
      options: string[];
      correctAnswer: number;
      explanation?: string;
    }>;
  };
  starterCode?: string;
}

interface LessonItem {
  id: string;
  title: string;
  slug: string;
  type: "reading" | "interactive";
  content?: string;
  exercises?: ExerciseItem[];
}

interface ModuleItem {
  id: string;
  title: string;
  description: string;
  requiredTimeMinutes?: number;
  requiredTimeSeconds?: number;
  lessons?: LessonItem[];
}

interface CourseItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  estimatedMinutes: number;
  modules?: ModuleItem[];
}

export default function AdminPathEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [path, setPath] = useState<any | null>(null);

  // Path form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [estimatedHours, setEstimatedHours] = useState(10);
  const [tagsInput, setTagsInput] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");

  // Expanded UI states
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // Active Modals
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [showAddModuleModal, setShowAddModuleModal] = useState<string | null>(null); // courseId
  const [showAddLessonModal, setShowAddLessonModal] = useState<string | null>(null); // moduleId
  const [showAddQuizModal, setShowAddQuizModal] = useState<string | null>(null); // lessonId
  const [editingLesson, setEditingLesson] = useState<LessonItem | null>(null);

  // Form states for modals
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDesc, setNewCourseDesc] = useState("");
  const [newCourseMinutes, setNewCourseMinutes] = useState(60);

  const [newModTitle, setNewModTitle] = useState("");
  const [newModDesc, setNewModDesc] = useState("");
  const [newModMinutes, setNewModMinutes] = useState(2);

  const [showEditModuleModal, setShowEditModuleModal] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleItem | null>(null);
  const [editModTitle, setEditModTitle] = useState("");
  const [editModDesc, setEditModDesc] = useState("");
  const [editModMinutes, setEditModMinutes] = useState(2);

  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonContent, setNewLessonContent] = useState(
    "# Lesson Overview\n\nExplain core algorithmic techniques here..."
  );
  const [newLessonType, setNewLessonType] = useState<"reading" | "interactive">("reading");

  // New Quiz state
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptA, setQuizOptA] = useState("");
  const [quizOptB, setQuizOptB] = useState("");
  const [quizOptC, setQuizOptC] = useState("");
  const [quizOptD, setQuizOptD] = useState("");
  const [quizCorrect, setQuizCorrect] = useState<number>(0);
  const [quizExplanation, setQuizExplanation] = useState("");
  const [quizXP, setQuizXP] = useState(10);

  useEffect(() => {
    loadPathTree();
  }, [id]);

  const loadPathTree = async () => {
    try {
      setLoading(true);
      const res = await adminLearningAPI.getPathDetails(id);
      const data = res.data?.data || res.data;
      setPath(data);

      setTitle(data.title || "");
      setDescription(data.description || "");
      setDifficulty(data.difficulty || "beginner");
      setEstimatedHours(data.estimatedHours || 10);
      setTagsInput(data.tags?.join(", ") || "");
      setStatus(data.status || "draft");

      // Expand all courses by default
      const coursesObj: Record<string, boolean> = {};
      const modulesObj: Record<string, boolean> = {};
      data.pathCourses?.forEach((pc: any) => {
        if (pc.course?.id) coursesObj[pc.course.id] = true;
        pc.course?.modules?.forEach((m: any) => {
          if (m.id) modulesObj[m.id] = true;
        });
      });
      setExpandedCourses(coursesObj);
      setExpandedModules(modulesObj);
    } catch (err) {
      console.error("Failed to load path tree", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePathMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await adminLearningAPI.updatePath(id, {
        title,
        description,
        difficulty,
        estimatedHours: Number(estimatedHours),
        tags,
        status,
      });
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to update path");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseTitle) return;
    try {
      setSaving(true);
      const res = await adminLearningAPI.createCourse({
        title: newCourseTitle,
        description: newCourseDesc,
        difficulty,
        estimatedMinutes: Number(newCourseMinutes),
      });
      const newCourse = res.data?.data || res.data;

      // Attach new course to current path
      const existingCourseIds =
        path.pathCourses?.map((pc: any) => pc.courseId || pc.course?.id) || [];
      existingCourseIds.push(newCourse.id);

      await adminLearningAPI.updatePath(id, {
        courseIds: existingCourseIds,
      });

      setShowAddCourseModal(false);
      setNewCourseTitle("");
      setNewCourseDesc("");
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create course");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddModuleModal || !newModTitle) return;
    try {
      setSaving(true);
      await adminLearningAPI.createModule(showAddModuleModal, {
        title: newModTitle,
        description: newModDesc,
        requiredTimeMinutes: Number(newModMinutes) || 2,
        requiredTimeSeconds: (Number(newModMinutes) || 2) * 60,
      });
      setShowAddModuleModal(null);
      setNewModTitle("");
      setNewModDesc("");
      setNewModMinutes(2);
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create module");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule || !editModTitle) return;
    try {
      setSaving(true);
      await adminLearningAPI.updateModule(editingModule.id, {
        title: editModTitle,
        description: editModDesc,
        requiredTimeMinutes: Number(editModMinutes) || 2,
        requiredTimeSeconds: (Number(editModMinutes) || 2) * 60,
      });
      setShowEditModuleModal(false);
      setEditingModule(null);
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to update module");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddLessonModal || !newLessonTitle) return;
    try {
      setSaving(true);
      await adminLearningAPI.createLesson(showAddLessonModal, {
        title: newLessonTitle,
        content: newLessonContent,
        type: newLessonType,
      });
      setShowAddLessonModal(null);
      setNewLessonTitle("");
      setNewLessonContent("# Lesson Overview\n\nExplain core algorithmic techniques here...");
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create lesson");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLessonContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson) return;
    try {
      setSaving(true);
      await adminLearningAPI.updateLesson(editingLesson.id, {
        title: editingLesson.title,
        content: editingLesson.content,
        type: editingLesson.type,
      });
      setEditingLesson(null);
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to save lesson content");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuizExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddQuizModal || !quizQuestion || !quizOptA || !quizOptB) return;
    try {
      setSaving(true);
      const options = [quizOptA, quizOptB];
      if (quizOptC) options.push(quizOptC);
      if (quizOptD) options.push(quizOptD);

      const quizConfig = {
        questions: [
          {
            id: `q-${Date.now()}`,
            question: quizQuestion,
            options,
            correctAnswer: Number(quizCorrect),
            explanation: quizExplanation,
          },
        ],
      };

      await adminLearningAPI.createExercise(showAddQuizModal, {
        title: quizQuestion.substring(0, 60),
        type: "quiz",
        marks: Number(quizXP),
        quizConfig,
      });

      setShowAddQuizModal(null);
      setQuizQuestion("");
      setQuizOptA("");
      setQuizOptB("");
      setQuizOptC("");
      setQuizOptD("");
      setQuizExplanation("");
      await loadPathTree();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create exercise");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm("Are you sure you want to remove this course from the path?")) return;
    try {
      setSaving(true);
      const remainingCourseIds =
        path.pathCourses
          ?.map((pc: any) => pc.courseId || pc.course?.id)
          .filter((cid: string) => cid !== courseId) || [];
      await adminLearningAPI.updatePath(id, { courseIds: remainingCourseIds });
      await loadPathTree();
    } catch (err: any) {
      alert("Failed to remove course");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("Delete this lesson and all its exercises?")) return;
    try {
      setSaving(true);
      await adminLearningAPI.deleteLesson(lessonId);
      await loadPathTree();
    } catch (err: any) {
      alert("Failed to delete lesson");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!confirm("Delete this practice exercise?")) return;
    try {
      setSaving(true);
      await adminLearningAPI.deleteExercise(exerciseId);
      await loadPathTree();
    } catch (err: any) {
      alert("Failed to delete exercise");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 font-sans text-foreground">
      {/* Top Breadcrumb & Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/learning/paths"
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
              <Compass className="w-3.5 h-3.5 text-primary" />
              <span>Curriculum Studio / Path Editor</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
              {title || "Edit Learning Path"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/learning/${path?.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground"
          >
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Preview Student View</span>
          </Link>

          <Button
            onClick={handleSavePathMetadata}
            disabled={saving}
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground font-semibold text-xs shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving Changes..." : "Save Path Metadata"}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Path Core Settings */}
        <div className="lg:col-span-1 bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Compass className="w-4 h-4 text-primary" />
            <span>Path Configuration</span>
          </h2>

          <form onSubmit={handleSavePathMetadata} className="space-y-3.5 text-xs">
            <div>
              <label className="font-semibold block mb-1">Path Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-medium"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">URL Slug</label>
              <input
                type="text"
                disabled
                value={path?.slug || ""}
                className="w-full px-3 py-2 rounded-lg bg-muted/70 border border-border text-muted-foreground font-mono"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Description</label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold block mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e: any) => setDifficulty(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Est. Hours</label>
                <input
                  type="number"
                  min={1}
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Publishing Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-semibold"
              >
                <option value="draft">Draft (Private)</option>
                <option value="published">Published (Live for Students)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </form>
        </div>

        {/* Right Column: Visual Course & Curriculum Hierarchy Builder */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <span>Curriculum Courses & Lessons ({path?.pathCourses?.length || 0})</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Structured sequence of courses, modules, reading lessons, and practice exercises
              </p>
            </div>

            <Button
              onClick={() => setShowAddCourseModal(true)}
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground font-semibold text-xs shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Course to Path</span>
            </Button>
          </div>

          {!path?.pathCourses || path.pathCourses.length === 0 ? (
            <div className="p-10 rounded-2xl border-2 border-dashed border-border bg-card text-center space-y-3">
              <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <h3 className="text-sm font-bold text-foreground">
                No Courses in this Path
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Add your first course to begin structuring modules, reading lessons, and practice exercises.
              </p>
              <Button
                onClick={() => setShowAddCourseModal(true)}
                size="sm"
                className="text-xs bg-primary text-primary-foreground font-semibold"
              >
                <Plus className="w-4 h-4 mr-1" />
                <span>Create First Course</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {path.pathCourses.map((pc: any, cIdx: number) => {
                const course = pc.course;
                if (!course) return null;
                const isExpanded = expandedCourses[course.id] ?? true;

                return (
                  <div
                    key={course.id}
                    className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Course Header Banner */}
                    <div className="p-4 bg-muted/20 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            setExpandedCourses({
                              ...expandedCourses,
                              [course.id]: !isExpanded,
                            })
                          }
                          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                              {cIdx + 1}
                            </span>
                            <h3 className="text-sm font-bold text-foreground">
                              {course.title}
                            </h3>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              {course.difficulty}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {course.modules?.length || 0} Modules · {course.estimatedMinutes || 60} mins
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setShowAddModuleModal(course.id)}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 gap-1 border-border bg-card"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Module</span>
                        </Button>

                        <button
                          onClick={() => handleDeleteCourse(course.id)}
                          className="w-7 h-7 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 flex items-center justify-center transition-colors"
                          title="Remove course from path"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Course Modules Body */}
                    {isExpanded && (
                      <div className="p-4 space-y-4">
                        {!course.modules || course.modules.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic text-center py-4">
                            No modules yet. Click "Add Module" to start adding lessons.
                          </p>
                        ) : (
                          course.modules.map((mod: any, mIdx: number) => {
                            const modExpanded = expandedModules[mod.id] ?? true;

                            return (
                              <div
                                key={mod.id}
                                className="border border-border/80 rounded-xl overflow-hidden bg-background"
                              >
                                {/* Module Header */}
                                <div className="px-3.5 py-2.5 bg-muted/30 border-b border-border/60 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() =>
                                        setExpandedModules({
                                          ...expandedModules,
                                          [mod.id]: !modExpanded,
                                        })
                                      }
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      {modExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    <span className="text-xs font-bold text-foreground">
                                      Module {mIdx + 1}: {mod.title}
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                      <Clock className="w-3 h-3 text-amber-500" />
                                      <span>{mod.requiredTimeMinutes || 2}m study stopwatch</span>
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingModule(mod);
                                        setEditModTitle(mod.title);
                                        setEditModDesc(mod.description || "");
                                        setEditModMinutes(mod.requiredTimeMinutes || 2);
                                        setShowEditModuleModal(true);
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Edit Time</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setShowAddLessonModal(mod.id)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add Lesson</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Lessons List */}
                                {modExpanded && (
                                  <div className="p-3 divide-y divide-border/60 space-y-2">
                                    {!mod.lessons || mod.lessons.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground italic py-2 text-center">
                                        No lessons in this module. Click "Add Lesson".
                                      </p>
                                    ) : (
                                      mod.lessons.map((lesson: any) => (
                                        <div
                                          key={lesson.id}
                                          className="pt-2 first:pt-0 space-y-2"
                                        >
                                          <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                              <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                              <span className="font-semibold text-foreground">
                                                {lesson.title}
                                              </span>
                                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded uppercase">
                                                {lesson.type}
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => setEditingLesson(lesson)}
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground hover:text-primary px-2 py-0.5 rounded bg-muted/60 hover:bg-muted"
                                              >
                                                <Edit3 className="w-3 h-3" />
                                                <span>Edit Content</span>
                                              </button>

                                              <button
                                                onClick={() => setShowAddQuizModal(lesson.id)}
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
                                              >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Quiz</span>
                                              </button>

                                              <button
                                                onClick={() => handleDeleteLesson(lesson.id)}
                                                className="text-muted-foreground hover:text-rose-500 p-1"
                                                title="Delete lesson"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Practice Exercises inside Lesson */}
                                          {lesson.exercises && lesson.exercises.length > 0 && (
                                            <div className="pl-6 space-y-1.5 pt-1">
                                              {lesson.exercises.map((ex: any) => (
                                                <div
                                                  key={ex.id}
                                                  className="p-2 rounded-lg bg-muted/20 border border-border flex items-center justify-between text-xs"
                                                >
                                                  <div className="flex items-center gap-2 truncate">
                                                    <CheckSquare className="w-3 h-3 text-emerald-500 shrink-0" />
                                                    <span className="font-medium text-foreground truncate">
                                                      {ex.title}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                      ({ex.type} · +{ex.marks} XP)
                                                    </span>
                                                  </div>

                                                  <button
                                                    onClick={() => handleDeleteExercise(ex.id)}
                                                    className="text-muted-foreground hover:text-rose-500 p-0.5"
                                                    title="Delete exercise"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: ADD COURSE ─────────────────────────────────────────────────── */}
      {showAddCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Add Course to Path
              </h3>
              <button
                onClick={() => setShowAddCourseModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Course Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dynamic Programming & Memoization"
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Course goals and outcomes..."
                  value={newCourseDesc}
                  onChange={(e) => setNewCourseDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Estimated Minutes</label>
                <input
                  type="number"
                  min={10}
                  value={newCourseMinutes}
                  onChange={(e) => setNewCourseMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddCourseModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {saving ? "Adding..." : "Add Course"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD MODULE ─────────────────────────────────────────────────── */}
      {showAddModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Add Course Module
              </h3>
              <button
                onClick={() => setShowAddModuleModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateModule} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Module Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Module 1: In-Place Array Transformations"
                  value={newModTitle}
                  onChange={(e) => setNewModTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Module learning objectives..."
                  value={newModDesc}
                  onChange={(e) => setNewModDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">
                  Required Study / Stopwatch Time (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={newModMinutes}
                    onChange={(e) => setNewModMinutes(parseInt(e.target.value) || 2)}
                    className="w-24 px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-mono font-bold"
                  />
                  <span className="text-muted-foreground text-[11px]">
                    Minimum time student must engage before unlocking next step.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModuleModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {saving ? "Creating..." : "Create Module"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT MODULE TIME & SETTINGS ────────────────────────────────────── */}
      {showEditModuleModal && editingModule && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-foreground">
                  Update Module Study Time & Settings
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowEditModuleModal(false);
                  setEditingModule(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateModule} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Module Title</label>
                <input
                  type="text"
                  required
                  value={editModTitle}
                  onChange={(e) => setEditModTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editModDesc}
                  onChange={(e) => setEditModDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">
                  Required Study / Stopwatch Time (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={editModMinutes}
                    onChange={(e) => setEditModMinutes(parseInt(e.target.value) || 2)}
                    className="w-24 px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-mono font-bold"
                  />
                  <span className="text-muted-foreground text-[11px]">
                    Duration in minutes ({editModMinutes * 60} seconds) students must spend.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowEditModuleModal(false);
                    setEditingModule(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {saving ? "Saving..." : "Update Module"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD LESSON ─────────────────────────────────────────────────── */}
      {showAddLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Add Lesson to Module
              </h3>
              <button
                onClick={() => setShowAddLessonModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Lesson Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Two-Pointer Technique Essentials"
                    value={newLessonTitle}
                    onChange={(e) => setNewLessonTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Lesson Type</label>
                  <select
                    value={newLessonType}
                    onChange={(e: any) => setNewLessonType(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  >
                    <option value="reading">Reading & Conceptual Guide</option>
                    <option value="interactive">Interactive Sandbox Practice</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">
                  Lesson Content (Markdown Supported)
                </label>
                <textarea
                  rows={8}
                  required
                  value={newLessonContent}
                  onChange={(e) => setNewLessonContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-mono text-[11px]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddLessonModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {saving ? "Creating..." : "Save Lesson"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT LESSON CONTENT ────────────────────────────────────────── */}
      {editingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Edit Lesson: {editingLesson.title}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Author markdown reading guide, syntax highlighted examples, and explanations
                </p>
              </div>
              <button
                onClick={() => setEditingLesson(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateLessonContent} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Lesson Title</label>
                <input
                  type="text"
                  required
                  value={editingLesson.title}
                  onChange={(e) =>
                    setEditingLesson({ ...editingLesson, title: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-semibold"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">
                  Lesson Markdown Content
                </label>
                <textarea
                  rows={14}
                  required
                  value={editingLesson.content || ""}
                  onChange={(e) =>
                    setEditingLesson({ ...editingLesson, content: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-muted/40 border border-border text-foreground font-mono text-[11px] leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingLesson(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {saving ? "Saving..." : "Save Lesson Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD QUIZ EXERCISE ──────────────────────────────────────────── */}
      {showAddQuizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Add Knowledge Check / Quiz
              </h3>
              <button
                onClick={() => setShowAddQuizModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuizExercise} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Question Prompt</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. What is the auxiliary space complexity of two-pointer traversal?"
                  value={quizQuestion}
                  onChange={(e) => setQuizQuestion(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="font-semibold block text-[11px]">Multiple Choice Options</label>
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Option A: O(N)"
                    value={quizOptA}
                    onChange={(e) => setQuizOptA(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Option B: O(1)"
                    value={quizOptB}
                    onChange={(e) => setQuizOptB(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Option C: O(log N)"
                    value={quizOptC}
                    onChange={(e) => setQuizOptC(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Option D: O(N^2)"
                    value={quizOptD}
                    onChange={(e) => setQuizOptD(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold block mb-1">Correct Answer</label>
                  <select
                    value={quizCorrect}
                    onChange={(e) => setQuizCorrect(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border text-foreground font-semibold"
                  >
                    <option value={0}>Option A</option>
                    <option value={1}>Option B</option>
                    <option value={2}>Option C</option>
                    <option value={3}>Option D</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Award XP</label>
                  <input
                    type="number"
                    min={5}
                    value={quizXP}
                    onChange={(e) => setQuizXP(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">
                  Explanation / Review Note (Shown After Answering)
                </label>
                <textarea
                  rows={2}
                  placeholder="Two pointers only allocate constant memory variables..."
                  value={quizExplanation}
                  onChange={(e) => setQuizExplanation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddQuizModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {saving ? "Adding..." : "Add Quiz Question"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
