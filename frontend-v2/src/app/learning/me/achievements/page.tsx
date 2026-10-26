"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Award,
  Zap,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Flame,
  Star,
  CheckCircle2,
} from "lucide-react";
import { learningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";

interface AchievementsData {
  totalXP: number;
  level: string;
  nextThreshold: number;
  progressToNextLevel: number;
  badgeCount: number;
  badges: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: string;
    category: string;
    awardedAt: string;
  }>;
  recentXPHistory: Array<{
    id: string;
    amount: number;
    eventType: string;
    notes: string;
    createdAt: string;
  }>;
}

export default function AchievementsPage() {
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const res = await learningAPI.getMyAchievements();
      const achievementsData = res.data?.data || res.data;
      setData(achievementsData);
    } catch (err) {
      console.error("Failed to load achievements", err);
    } finally {
      setLoading(false);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-20 px-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <div>
          <Link
            href="/learning"
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Learning Catalog</span>
          </Link>
        </div>

        {/* Hero Card */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mb-3">
                <Trophy className="w-3.5 h-3.5" />
                <span>Verified Skills & Gamification</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Achievements & Skill Level
              </h1>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
                Earn experience points (XP) across interactive quizzes and exercises, climb skill tiers, and unlock verifiable badges.
              </p>
            </div>

            <div className="flex items-center gap-4 bg-muted/40 border border-border p-4 rounded-xl shadow-inner">
              <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Flame className="w-8 h-8" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase">
                  Current Level
                </div>
                <div className="text-xl font-extrabold text-foreground capitalize">
                  {data?.level || "Beginner"}
                </div>
                <div className="text-xs font-semibold text-primary mt-0.5">
                  {data?.totalXP || 0} Total XP Earned
                </div>
              </div>
            </div>
          </div>

          {/* Level Progress Bar */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex justify-between text-xs font-semibold mb-2">
              <span className="text-muted-foreground">Progress to Next Tier</span>
              <span className="text-primary font-bold">
                {data?.progressToNextLevel || 0}%
              </span>
            </div>
            <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${data?.progressToNextLevel || 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Badges Showcase */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Skill Badges ({data?.badgeCount || 0})</span>
            </h2>
            <span className="text-xs text-muted-foreground font-medium">
              Tamper-proof verifiable credentials
            </span>
          </div>

          {!data?.badges || data.badges.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-border p-8 shadow-sm">
              <Star className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-base font-bold text-foreground">No Badges Unlocked Yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Complete your first reading lesson, pass a quiz, or solve a coding challenge to earn your first badge!
              </p>
              <Link
                href="/learning"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold transition-all shadow-sm"
              >
                <span>Start Learning</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.badges.map((b) => (
                <div
                  key={b.id}
                  className="bg-card border border-border rounded-xl p-5 hover:border-foreground/20 hover:shadow-md transition-all shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                          rarityBadgeColors[b.rarity] || rarityBadgeColors.common
                        }`}
                      >
                        {b.rarity}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(b.awardedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="w-16 h-16 mx-auto my-3 flex items-center justify-center">
                      <img
                        src={b.iconUrl || "/images/badges/default-badge.svg"}
                        alt={b.name}
                        className="w-14 h-14 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/badges/default-badge.svg";
                        }}
                      />
                    </div>

                    <h3 className="text-base font-bold text-foreground text-center">
                      {b.name}
                    </h3>
                    <p className="text-xs text-muted-foreground text-center mt-1 leading-relaxed">
                      {b.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Unlocked & Verified</span>
                    </div>

                    <button
                      onClick={() => {
                        const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                          `${window.location.origin}/learning/me/achievements`
                        )}`;
                        window.open(shareUrl, "_blank", "noopener,noreferrer,width=650,height=600");
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border border-border bg-muted/40 hover:bg-muted text-[11px] font-semibold text-foreground transition-colors shadow-sm"
                      title="Share your badge achievement on LinkedIn"
                    >
                      <svg className="w-3.5 h-3.5 fill-[#0A66C2]" viewBox="0 0 24 24">
                        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
                      </svg>
                      <span>Share on LinkedIn</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* XP Audit Ledger */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span>Recent XP Ledger Transactions</span>
          </h2>

          {!data?.recentXPHistory || data.recentXPHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No ledger transactions recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentXPHistory.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-foreground capitalize">
                      {item.eventType.replace("_", " ")}
                    </span>
                    <p className="text-muted-foreground text-[11px]">{item.notes}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      +{item.amount} XP
                    </span>
                    <p className="text-muted-foreground text-[10px]">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
