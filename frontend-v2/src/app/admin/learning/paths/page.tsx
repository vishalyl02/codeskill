"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Compass,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
  X,
  Check,
  Edit3,
  Trash2,
  BookOpen,
} from "lucide-react";
import { adminLearningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface PathItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedHours: number;
  status: "draft" | "published" | "archived";
  version: number;
  tags: string[];
  pathCourses?: any[];
}

export default function AdminLearningPathsPage() {
  const [paths, setPaths] = useState<PathItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [estimatedHours, setEstimatedHours] = useState(10);
  const [tagsInput, setTagsInput] = useState("JavaScript, Web Development");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadPaths();
  }, []);

  const loadPaths = async () => {
    try {
      setLoading(true);
      const res = await adminLearningAPI.getPaths();
      const raw = res.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : [];
      setPaths(list);
    } catch (err) {
      console.error("Failed to load paths", err);
      setPaths([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    try {
      setCreating(true);
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await adminLearningAPI.createPath({
        title,
        description,
        difficulty,
        estimatedHours: Number(estimatedHours),
        tags,
        status: "published",
      });

      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      await loadPaths();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create learning path");
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      setPublishingId(id);
      await adminLearningAPI.publishPath(id);
      await loadPaths();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to publish path");
    } finally {
      setPublishingId(null);
    }
  };

  const handleDeletePath = async (id: string, pathTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${pathTitle}"?`)) return;
    try {
      await adminLearningAPI.deletePath(id);
      await loadPaths();
    } catch (err) {
      alert("Failed to delete learning path");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans text-foreground">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="space-y-1">
          <Link
            href="/admin/learning"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Learning Admin Studio</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Learning Paths & Curriculum
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Author structured engineering tracks, manage courses, and author lesson modules with practice exercises.
          </p>
        </div>

        <Button
          onClick={() => setShowCreateModal(true)}
          size="sm"
          className="gap-1.5 bg-primary text-primary-foreground font-semibold shadow-sm text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Path</span>
        </Button>
      </div>

      {/* Path Cards List */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[350px]">
          <Spinner className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : paths.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border p-8 shadow-sm">
          <Compass className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-base font-bold text-foreground">No learning paths yet</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Click &quot;Create New Path&quot; to author your first curriculum track.
          </p>
          <Button
            onClick={() => setShowCreateModal(true)}
            size="sm"
            className="mt-4 gap-1.5 bg-primary text-primary-foreground font-semibold text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Path</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {paths.map((path) => (
            <div
              key={path.id}
              className="bg-card border border-border rounded-xl p-5 shadow-xs hover:border-foreground/20 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      path.status === "published"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {path.status} · v{path.version || 1}
                  </span>

                  <span className="text-xs text-muted-foreground capitalize font-medium">
                    {path.difficulty}
                  </span>
                </div>

                <h3 className="text-base font-bold text-foreground leading-snug">
                  {path.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                  {path.description || "No description provided."}
                </p>

                <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{path.estimatedHours} hrs</span>
                  <span>·</span>
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{path.pathCourses?.length || 0} Courses</span>
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between gap-2">
                <Link
                  href={`/admin/learning/paths/${path.id}/edit`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Curriculum</span>
                </Link>

                <Link
                  href={`/learning/${path.slug}`}
                  target="_blank"
                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="View student path"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>

                <button
                  onClick={() => handleDeletePath(path.id, path.title)}
                  className="p-1.5 rounded-lg border border-border hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                  title="Delete path"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Create New Learning Path
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePath} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Path Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Python for Problem Solving & Algorithms"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Outline the curriculum goals and technical competencies gained..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Difficulty Level</label>
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
                  <label className="font-semibold block mb-1">Estimated Duration (Hours)</label>
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

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creating}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {creating ? "Creating..." : "Save Path"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
