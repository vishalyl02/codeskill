"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Compass,
  Search,
  Filter,
  BookOpen,
  Award,
  Clock,
  ArrowRight,
  Sparkles,
  Trophy,
  Layers,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Terminal,
  Code2,
} from "lucide-react";
import { learningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LearningPathItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedHours: number;
  tags: string[];
  iconUrl?: string;
  courseCount: number;
  isEnrolled: boolean;
  progressPercent: number;
  completedCourses: number;
}

const CATEGORIES = [
  { id: "all", label: "All Topics", icon: Compass },
  { id: "cs-core", label: "Core CS (1st-4th Year)", icon: BookOpen, filterTag: "CS Core" },
  { id: "dbms", label: "DBMS", icon: Layers, filterTag: "DBMS" },
  { id: "os", label: "Operating Systems", icon: Cpu, filterTag: "Operating Systems" },
  { id: "java", label: "Java & OOP", icon: Code2, filterTag: "Java" },
  { id: "fundamentals", label: "Fundamentals", icon: Terminal, filterTag: "Fundamentals" },
  { id: "ai", label: "Generative AI & LLMs", icon: Sparkles, filterTag: "AI" },
  { id: "dsa", label: "Algorithms & DSA", icon: Trophy, filterTag: "DSA" },
  { id: "python", label: "Python Mastery", icon: Terminal, filterTag: "Python" },
  { id: "javascript", label: "Modern JavaScript", icon: Code2, filterTag: "JavaScript" },
];

export default function LearningPathsCatalogPage() {
  const [paths, setPaths] = useState<LearningPathItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    fetchPaths();
  }, [difficulty]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, difficulty, selectedCategory]);

  const fetchPaths = async () => {
    try {
      setLoading(true);
      const res = await learningAPI.getPaths({
        search: search.trim() || undefined,
        difficulty: difficulty === "all" ? undefined : difficulty,
      });

      // Defensively parse array whether backend wrapped in { success, data } or returned raw array
      let rawList: any[] = [];
      if (Array.isArray(res.data)) {
        rawList = res.data;
      } else if (res.data && Array.isArray(res.data.data)) {
        rawList = res.data.data;
      } else if (res.data && Array.isArray(res.data.paths)) {
        rawList = res.data.paths;
      }

      setPaths(rawList);
    } catch (err) {
      console.error("Failed to load learning paths", err);
      setPaths([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPaths();
  };

  // Safely filter paths by category and search
  const filteredPaths = useMemo(() => {
    if (!Array.isArray(paths)) return [];
    return paths.filter((p) => {
      // Category filter
      if (selectedCategory !== "all") {
        const cat = CATEGORIES.find((c) => c.id === selectedCategory);
        if (cat?.filterTag) {
          const matchCategory = p.tags?.some((t) =>
            t.toLowerCase().includes(cat.filterTag.toLowerCase())
          ) || p.title?.toLowerCase().includes(cat.filterTag.toLowerCase());
          if (!matchCategory) return false;
        }
      }

      // Live search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = p.title?.toLowerCase().includes(q);
        const matchesDesc = p.description?.toLowerCase().includes(q);
        const matchesTags = p.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesTags) return false;
      }

      return true;
    });
  }, [paths, selectedCategory, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPaths.length / pageSize));
  const paginatedPaths = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPaths.slice(start, start + pageSize);
  }, [filteredPaths, currentPage, pageSize]);

  const difficultyColors: Record<string, string> = {
    beginner: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    intermediate: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    advanced: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };

  const getPathTechIcon = (path: LearningPathItem) => {
    if (path.iconUrl && path.iconUrl.startsWith("/")) {
      return path.iconUrl;
    }
    const tagsLower = (path.tags || []).map((t) => t.toLowerCase()).join(" ");
    if (tagsLower.includes("ai") || tagsLower.includes("prompt")) return "/images/tech/ai-brain.svg";
    if (tagsLower.includes("python")) return "/images/tech/python.svg";
    if (tagsLower.includes("javascript") || tagsLower.includes("es6")) return "/images/tech/javascript.svg";
    return "/images/badges/algo-master.svg";
  };

  return (
    <div className="min-h-screen bg-background w-full pt-24 pb-12 px-6 flex flex-col font-sans text-foreground">
      <div className="max-w-[1600px] mx-auto flex-1 flex flex-col w-full h-full space-y-8">
        
        {/* Top Header matching standard application styling */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Interactive Practice Paths · Verified Credentials</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Learning Paths</h1>
            <p className="text-muted-foreground max-w-2xl">
              Master modern technologies with hands-on reading lessons, instant quiz feedback, sandbox coding challenges, and verifiable certificates.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/learning/me/achievements"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-card hover:bg-muted text-sm font-medium text-foreground transition-colors shadow-sm"
            >
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>XP & Badges</span>
            </Link>
            <Link
              href="/learning/me/certificates"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors shadow-sm"
            >
              <Award className="w-4 h-4" />
              <span>My Certificates</span>
            </Link>
          </div>
        </div>

        {/* Search & Difficulty Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Category Chips matching Problems page design */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border cursor-pointer ${
                    isActive
                      ? "bg-foreground text-background border-foreground shadow-sm"
                      : "bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground shadow-sm"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search tracks or topics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 bg-transparent border-border text-foreground rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring placeholder:text-muted-foreground shadow-sm"
              />
            </div>

            <div className="relative">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="h-10 bg-card border border-border text-foreground text-sm font-medium rounded-md px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-ring shadow-sm cursor-pointer"
              >
                <option value="all">All Difficulties</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-card border border-border rounded-xl">
              <Spinner className="w-7 h-7 text-primary mb-3 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading learning tracks...</p>
            </div>
          ) : filteredPaths.length === 0 ? (
            <div className="text-center py-20 bg-card border border-border rounded-xl p-8 shadow-sm">
              <BookOpen className="w-12 h-12 text-muted-foreground/60 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No learning paths found</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
                Try selecting &quot;All Topics&quot; or clearing your search filter.
              </p>
            </div>
          ) : (
            <>
              {/* Results Count & Meta */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{paginatedPaths.length}</span> of{" "}
                  <span className="font-semibold text-foreground">{filteredPaths.length}</span> paths
                </p>
                {totalPages > 1 && (
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedPaths.map((path) => {
                  const iconSrc = getPathTechIcon(path);
                  return (
                    <div
                      key={path.id}
                      className="group relative flex flex-col justify-between rounded-xl bg-card border border-border p-6 hover:border-foreground/20 hover:shadow-md transition-all duration-200 shadow-sm"
                    >
                      <div>
                        {/* Card Header with Tech Logo & Difficulty */}
                        <div className="flex items-start justify-between gap-3 mb-5">
                          <div className="w-12 h-12 rounded-lg bg-muted/60 border border-border p-2 flex items-center justify-center shadow-inner group-hover:border-primary/40 transition-colors">
                            <img
                              src={iconSrc}
                              alt={path.title}
                              className="w-8 h-8 object-contain"
                            />
                          </div>

                          <div className="flex flex-col items-end gap-1.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                difficultyColors[path.difficulty] || difficultyColors.beginner
                              } capitalize`}
                            >
                              {path.difficulty}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" />
                              <span>~{path.estimatedHours}h</span>
                            </div>
                          </div>
                        </div>

                        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                          {path.title}
                        </h3>

                        <p className="mt-2 text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                          {path.description}
                        </p>

                        {/* Tags */}
                        {path.tags && path.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-4">
                            {path.tags.slice(0, 4).map((tag, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-muted-foreground border border-border"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-5 border-t border-border">
                        {/* Progress Bar if enrolled */}
                        {path.isEnrolled ? (
                          <div className="mb-4">
                            <div className="flex justify-between text-xs font-semibold mb-1.5">
                              <span className="text-muted-foreground">Track Progress</span>
                              <span className="text-primary font-bold">{path.progressPercent}%</span>
                            </div>
                            <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-primary h-full rounded-full transition-all duration-500"
                                style={{ width: `${path.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                            <div className="flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-muted-foreground" />
                              <span>{path.courseCount} Courses</span>
                            </div>
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <Sparkles className="w-3 h-3" />
                              <span>Verified Certificate</span>
                            </span>
                          </div>
                        )}

                        <Link
                          href={`/learning/${path.slug}`}
                          className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                            path.isEnrolled
                              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                              : "bg-muted hover:bg-muted/80 text-foreground border border-border"
                          }`}
                        >
                          <span>{path.isEnrolled ? "Continue Learning" : "View Curriculum"}</span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-9 px-3 gap-1 border-border text-foreground hover:bg-muted font-medium"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-9 h-9 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          currentPage === pageNum
                            ? "bg-foreground text-background shadow-sm"
                            : "bg-transparent hover:bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-9 px-3 gap-1 border-border text-foreground hover:bg-muted font-medium"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
