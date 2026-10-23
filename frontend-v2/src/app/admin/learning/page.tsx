"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Compass,
  BookOpen,
  Award,
  Users,
  ShieldCheck,
  Plus,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Layers,
  GraduationCap,
  Settings,
  ExternalLink,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Check,
  Clock,
  Filter,
} from "lucide-react";
import { adminLearningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface OverviewMetrics {
  totalPaths: number;
  totalCourses: number;
  totalEnrollments: number;
  totalCertificates: number;
  recentCertificates: Array<any>;
}

export default function AdminLearningDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "paths" | "badges" | "certificates">("overview");
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [paths, setPaths] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreatePathModal, setShowCreatePathModal] = useState(false);
  const [showCreateBadgeModal, setShowCreateBadgeModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedCertToRevoke, setSelectedCertToRevoke] = useState<any | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // New Path Form State
  const [pathTitle, setPathTitle] = useState("");
  const [pathDescription, setPathDescription] = useState("");
  const [pathDifficulty, setPathDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [pathHours, setPathHours] = useState(12);
  const [pathTags, setPathTags] = useState("DSA, Algorithms, Two Pointers");

  // New Badge Form State
  const [badgeName, setBadgeName] = useState("");
  const [badgeCode, setBadgeCode] = useState("");
  const [badgeDescription, setBadgeDescription] = useState("");
  const [badgeRarity, setBadgeRarity] = useState<"common" | "rare" | "epic" | "legendary">("common");
  const [badgeCategory, setBadgeCategory] = useState<"milestone" | "skill" | "streak">("skill");
  const [badgeIconUrl, setBadgeIconUrl] = useState("/images/badges/default-badge.svg");
  const [badgeXP, setBadgeXP] = useState(50);

  // Filter/Search states
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [overviewRes, pathsRes, badgesRes, certsRes] = await Promise.allSettled([
        adminLearningAPI.getOverview(),
        adminLearningAPI.getPaths(),
        adminLearningAPI.getBadges(),
        adminLearningAPI.getCertificates(),
      ]);

      if (overviewRes.status === "fulfilled") {
        const d = overviewRes.value?.data;
        setMetrics(d?.data || d);
      }
      if (pathsRes.status === "fulfilled") {
        const d = pathsRes.value?.data;
        const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
        setPaths(list);
      }
      if (badgesRes.status === "fulfilled") {
        const d = badgesRes.value?.data;
        const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
        setBadges(list);
      }
      if (certsRes.status === "fulfilled") {
        const d = certsRes.value?.data;
        const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
        setCertificates(list);
      }
    } catch (err) {
      console.error("Failed to load admin learning data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathTitle) return;
    try {
      setActionLoading(true);
      const tags = pathTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await adminLearningAPI.createPath({
        title: pathTitle,
        description: pathDescription,
        difficulty: pathDifficulty,
        estimatedHours: Number(pathHours),
        tags,
        status: "published",
      });

      setShowCreatePathModal(false);
      setPathTitle("");
      setPathDescription("");
      await loadAllData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create learning path");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeName || !badgeCode) return;
    try {
      setActionLoading(true);
      await adminLearningAPI.createBadge({
        code: badgeCode.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        name: badgeName,
        description: badgeDescription,
        rarity: badgeRarity,
        category: badgeCategory,
        iconUrl: badgeIconUrl,
        criteria: { minXP: Number(badgeXP) },
      });

      setShowCreateBadgeModal(false);
      setBadgeName("");
      setBadgeCode("");
      setBadgeDescription("");
      await loadAllData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create badge");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCertToRevoke || !revokeReason) return;
    try {
      setActionLoading(true);
      await adminLearningAPI.revokeCertificate(selectedCertToRevoke.id, revokeReason);
      setShowRevokeModal(false);
      setSelectedCertToRevoke(null);
      setRevokeReason("");
      await loadAllData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to revoke certificate");
    } finally {
      setActionLoading(false);
    }
  };

  const rarityBadgeColors: Record<string, string> = {
    common: "border-border bg-muted/40 text-muted-foreground",
    rare: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    epic: "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400",
    legendary: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[450px]">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans text-foreground">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-2">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Chandigarh University Admin Studio</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Learning, Badges & Certification Control
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Author and publish technical curricula, manage verifiable skill badges, and audit university credentials.
          </p>
        </div>

        {/* Global Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowCreatePathModal(true)}
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground font-semibold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Learning Path</span>
          </Button>

          <Button
            onClick={() => setShowCreateBadgeModal(true)}
            variant="outline"
            size="sm"
            className="gap-1.5 border-border bg-card text-foreground hover:bg-muted font-semibold text-xs shadow-sm"
          >
            <Award className="w-4 h-4 text-amber-500" />
            <span>New Badge</span>
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Overview Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab("paths")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === "paths"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Learning Paths ({paths.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("badges")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === "badges"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Skill Badges ({badges.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("certificates")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === "certificates"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>University Certificates ({certificates.length})</span>
        </button>
      </div>

      {/* ── TAB 1: OVERVIEW ──────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-3">
                <span>Active Paths</span>
                <Compass className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-black text-foreground">
                {metrics?.totalPaths || paths.length}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Published curricula
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-3">
                <span>Total Courses</span>
                <BookOpen className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-foreground">
                {metrics?.totalCourses || 4}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Modular technical units
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-3">
                <span>Active Enrollments</span>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-foreground">
                {metrics?.totalEnrollments || 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Students actively learning
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-3">
                <span>Issued Certificates</span>
                <ShieldCheck className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-foreground">
                {metrics?.totalCertificates || certificates.length}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Verified on ledger
              </div>
            </div>
          </div>

          {/* Recent Credentials Section */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Recent Issued Credentials
                </h2>
                <p className="text-xs text-muted-foreground">
                  Latest university certificates generated across learning paths
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("certificates")}
                className="text-xs gap-1 border-border"
              >
                <span>View All Registry</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {certificates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No certificates issued yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {certificates.slice(0, 5).map((cert) => (
                  <div
                    key={cert.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">
                          {cert.recipientName}
                        </span>
                        <span className="font-mono text-[10px] font-bold bg-muted px-2 py-0.5 rounded border border-border">
                          {cert.credentialId}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        {cert.pathTitle} · Issued {new Date(cert.issueDate || cert.issuedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/verify/${cert.credentialId}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-semibold border border-border"
                      >
                        <span>Inspect Certificate</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: LEARNING PATHS ─────────────────────────────────────────────────── */}
      {activeTab === "paths" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">
              Learning Paths ({paths.length})
            </h2>
            <Button
              onClick={() => setShowCreatePathModal(true)}
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground font-semibold text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create Learning Path</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paths.map((path) => (
              <div
                key={path.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-foreground/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      {path.difficulty}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{path.estimatedHours} hrs</span>
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-foreground mb-1">
                    {path.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {path.description || "No description provided."}
                  </p>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {path.tags?.map((t: string, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    /{path.slug}
                  </span>
                  <Link
                    href={`/learning/${path.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-semibold text-xs"
                  >
                    <span>Preview Path</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: BADGES MANAGER ─────────────────────────────────────────────────── */}
      {activeTab === "badges" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Verifiable Skill Badges ({badges.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Gamification badges awarded automatically upon completing exercises and milestones
              </p>
            </div>
            <Button
              onClick={() => setShowCreateBadgeModal(true)}
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground font-semibold text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Badge</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {badges.map((b) => (
              <div
                key={b.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-foreground/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        rarityBadgeColors[b.rarity] || rarityBadgeColors.common
                      }`}
                    >
                      {b.rarity}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">
                      {b.category}
                    </span>
                  </div>

                  <div className="w-14 h-14 mx-auto my-2 flex items-center justify-center">
                    <img
                      src={b.iconUrl || "/images/badges/default-badge.svg"}
                      alt={b.name}
                      className="w-12 h-12 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/images/badges/default-badge.svg";
                      }}
                    />
                  </div>

                  <h3 className="text-sm font-bold text-foreground text-center">
                    {b.name}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center mt-1 leading-relaxed">
                    {b.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Code: <code className="font-mono">{b.code}</code></span>
                  <span className="font-semibold text-primary">
                    +{b.criteria?.minXP || 50} XP
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: CERTIFICATES REGISTRY ────────────────────────────────────────── */}
      {activeTab === "certificates" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Chandigarh University Certificate Registry ({certificates.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Official cryptographically verifiable student completion credentials
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search recipient or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-64"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase font-bold text-[10px]">
                  <tr>
                    <th className="p-3.5">Recipient Student</th>
                    <th className="p-3.5">Learning Path</th>
                    <th className="p-3.5">Credential ID</th>
                    <th className="p-3.5">Issue Date</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {certificates
                    .filter(
                      (c) =>
                        !searchQuery ||
                        c.recipientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.credentialId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.pathTitle?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((cert) => (
                      <tr key={cert.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3.5 font-bold text-foreground">
                          {cert.recipientName}
                        </td>
                        <td className="p-3.5 text-foreground max-w-xs truncate">
                          {cert.pathTitle}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-muted-foreground">
                          {cert.credentialId}
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {new Date(cert.issueDate || cert.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3.5">
                          {cert.status === "valid" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Valid</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-500 font-semibold text-[11px]">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Revoked</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          <Link
                            href={`/verify/${cert.credentialId}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground font-semibold text-[11px] border border-border"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>

                          {cert.status === "valid" && (
                            <button
                              onClick={() => {
                                setSelectedCertToRevoke(cert);
                                setShowRevokeModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold text-[11px] border border-rose-500/20"
                            >
                              <span>Revoke</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE LEARNING PATH ─────────────────────────────────────────── */}
      {showCreatePathModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Create New Learning Path
              </h3>
              <button
                onClick={() => setShowCreatePathModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePath} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Path Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Advanced System Design & Distributed Systems"
                  value={pathTitle}
                  onChange={(e) => setPathTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Comprehensive curriculum overview..."
                  value={pathDescription}
                  onChange={(e) => setPathDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Difficulty</label>
                  <select
                    value={pathDifficulty}
                    onChange={(e: any) => setPathDifficulty(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
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
                    value={pathHours}
                    onChange={(e) => setPathHours(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={pathTags}
                  onChange={(e) => setPathTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreatePathModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {actionLoading ? "Creating..." : "Create & Publish Path"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE SKILL BADGE ───────────────────────────────────────────── */}
      {showCreateBadgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Create New Verifiable Badge
              </h3>
              <button
                onClick={() => setShowCreateBadgeModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBadge} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Badge Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Graph Algorithms Master"
                    value={badgeName}
                    onChange={(e) => setBadgeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Badge Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. graph-master"
                    value={badgeCode}
                    onChange={(e) => setBadgeCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Master all graph traversal exercises..."
                  value={badgeDescription}
                  onChange={(e) => setBadgeDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Rarity</label>
                  <select
                    value={badgeRarity}
                    onChange={(e: any) => setBadgeRarity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  >
                    <option value="common">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Category</label>
                  <select
                    value={badgeCategory}
                    onChange={(e: any) => setBadgeCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  >
                    <option value="skill">Skill</option>
                    <option value="milestone">Milestone</option>
                    <option value="streak">Streak</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Award XP</label>
                  <input
                    type="number"
                    min={10}
                    value={badgeXP}
                    onChange={(e) => setBadgeXP(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Icon URL</label>
                <input
                  type="text"
                  value={badgeIconUrl}
                  onChange={(e) => setBadgeIconUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateBadgeModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {actionLoading ? "Saving..." : "Create Badge"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REVOKE CERTIFICATE ───────────────────────────────────────────── */}
      {showRevokeModal && selectedCertToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Revoke University Credential
                </h3>
                <p className="text-xs text-muted-foreground">
                  {selectedCertToRevoke.credentialId} · {selectedCertToRevoke.recipientName}
                </p>
              </div>
            </div>

            <form onSubmit={handleRevokeCertificate} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1 text-foreground">
                  Official Audit Reason for Revocation
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Code plagiarism detected during proctored audit..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRevokeModal(false);
                    setSelectedCertToRevoke(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading || !revokeReason}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  {actionLoading ? "Revoking..." : "Confirm Revocation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
