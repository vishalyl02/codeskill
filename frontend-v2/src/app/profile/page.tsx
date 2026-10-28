"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  User as UserIcon, 
  Settings, 
  BookOpen, 
  Trophy, 
  Code2, 
  Target,
  CheckCircle2,
  Building2,
  GraduationCap,
  Camera,
  Mail,
  Sparkles,
  UserRound,
  ArrowRight,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { authAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";

type ProfileFormValues = {
  name: string;
  username: string;
  bio: string;
  institution: string;
  role: string;
  preferredLanguage: string;
};

export default function ProfilePage() {
  const { user, loading, updateProfile, updateUserLocal } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLinking, setIsLinking] = useState<"github" | null>(null);
  const oauthCallbackHandled = useRef(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormValues>();

  useEffect(() => {
    setMounted(true);
    if (!loading && !user) {
      router.push("/login");
    } else if (user) {
      reset({
        name: user.name || "",
        username: user.username || "",
        bio: user.bio || "",
        institution: user.profile?.institution || "",
        role: user.profile?.role || "student",
        preferredLanguage: user.profile?.preferredLanguage || "python",
      });
    }
  }, [user, loading, router, reset]);

  useEffect(() => {
    if (loading || !user || typeof window === "undefined" || oauthCallbackHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("social");
    if (provider !== "github") return;

    oauthCallbackHandled.current = true;
    const cleanCallbackUrl = () => router.replace("/profile", { scroll: false });
    const providerError = params.get("error_description") || params.get("error");
    const code = params.get("code");
    const state = params.get("state");
    if (providerError) {
      setErrorMessage(`Account authorization was cancelled or denied: ${providerError}`);
      cleanCallbackUrl();
      return;
    }
    if (!code || !state) {
      setErrorMessage("The social account provider returned an incomplete authorization. Please try again.");
      cleanCallbackUrl();
      return;
    }

    setIsLinking(provider);
    void (async () => {
      try {
        const redirectUri = `${window.location.origin}/profile?social=${provider}`;
        await authAPI.completeSocialAccountLink({ provider, code, state, redirectUri });
        const refreshedUser = await authAPI.getMe();
        updateUserLocal(refreshedUser.data.user);
        setSuccessMessage("GitHub account connected successfully.");
        setErrorMessage("");
      } catch (err: any) {
        setErrorMessage(err.response?.data?.message || err.message || "Could not connect this social account.");
      } finally {
        setIsLinking(null);
        cleanCallbackUrl();
      }
    })();
  }, [loading, user, router, updateUserLocal]);

  if (!mounted || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <Spinner className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const onSubmit = async (data: ProfileFormValues) => {
    setIsSaving(true);
    setSuccessMessage("");
    setErrorMessage("");
    try {
      await updateProfile({
        name: data.name,
        username: data.username,
        bio: data.bio,
        profile: {
          institution: data.institution,
          role: data.role,
          preferredLanguage: data.preferredLanguage,
        }
      });
      setSuccessMessage("Profile updated successfully.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      
      await authAPI.uploadAvatar(formData);
      setSuccessMessage("Profile picture updated successfully!");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || "Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSocialAccountConnect = async (provider: "github") => {
    setErrorMessage("");
    setSuccessMessage("");
    setIsLinking(provider);
    try {
      const redirectUri = `${window.location.origin}/profile?social=${provider}`;
      const response = await authAPI.startSocialAccountLink({ provider, redirectUri });
      const authorizationUrl = response.data?.authorizationUrl;
      if (!authorizationUrl) throw new Error("The authorization link could not be created.");
      window.location.assign(authorizationUrl);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || "Could not start account connection.");
      setIsLinking(null);
    }
  };

  const stats = [
    { label: "Total Solved", value: user.stats?.totalSolved || 0, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Current Streak", value: `${user.stats?.currentStreak || 0} days`, icon: Trophy, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Total Submissions", value: user.stats?.totalSubmissions || 0, icon: Target, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="mx-auto mt-14 w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:mt-20 md:pt-10">
        <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Settings className="size-3.5" /> ACCOUNT SETTINGS
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your profile</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Keep your CodeSkill profile up to date and make your learning progress yours.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Sparkles className="size-4 text-primary" />
            <span>Personalize your learning space</span>
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(250px,0.82fr)_minmax(0,1.8fr)] lg:gap-8">
          <aside className="space-y-5">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="h-24 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" />
              <div className="px-5 pb-5">
                <div className="-mt-12 flex items-end justify-between">
                  <div className="group relative flex size-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-md">
                    {isUploading ? (
                      <Spinner className="size-7 animate-spin text-primary" />
                    ) : user.avatar ? (
                      <img src={user.avatar} alt={`${user.name} profile`} className="size-full object-cover" />
                    ) : (
                      <UserIcon className="size-10 text-muted-foreground" />
                    )}
                    <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Camera className="size-5" />
                      <span className="text-[11px] font-semibold">Update photo</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/gif"
                        className="sr-only"
                        aria-label="Upload profile photo"
                        onChange={handleAvatarUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                  <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                </div>
                <div className="mt-4 min-w-0">
                  <h2 className="truncate text-xl font-bold tracking-tight">{user.name}</h2>
                  <p className="mt-1 flex items-center gap-2 truncate text-sm text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" /> {user.email}
                  </p>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-semibold capitalize text-foreground">
                  <UserRound className="size-3.5 text-primary" /> {user.profile?.role || "Student"} account
                </div>
                {user.githubId && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {user.githubId && user.profile?.githubUrl && (
                      <a href={user.profile.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                        <Code2 className="size-3.5" /> GitHub
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Learning progress</h3>
                  <p className="mt-1 text-xs text-muted-foreground">A snapshot of your activity</p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="size-4" />
                </div>
              </div>
              <div className="space-y-1">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between rounded-xl px-2 py-3 transition-colors hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
                        <stat.icon className="size-4" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                    </div>
                    <span className="pl-3 text-sm font-bold tabular-nums">{stat.value}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-start gap-4 border-b border-border px-5 py-5 sm:px-7">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Personal information</h2>
                <p className="mt-1 text-sm text-muted-foreground">Update your details and learning preferences.</p>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              {successMessage && (
                <div role="status" className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" /> {successMessage}
                </div>
              )}
              {errorMessage && (
                <div role="alert" className="mb-5 flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">!</span>
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-7">
                <div>
                  <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <UserRound className="size-3.5" /> About you
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="profile-name" className="text-sm font-semibold">Full name</label>
                      <input id="profile-name" type="text" {...register("name", { required: "Name is required" })}
                        className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                        placeholder="e.g. Jane Doe" />
                      {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="profile-username" className="text-sm font-semibold">Username</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">@</span>
                        <input id="profile-username" type="text" {...register("username", {
                          required: "Username is required",
                          pattern: { value: /^[a-z0-9_]+$/, message: "Use lowercase letters, numbers, and underscores only" }
                        })} className="h-11 w-full rounded-xl border border-input bg-background pl-8 pr-3.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="jane_doe" />
                      </div>
                      {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    <label htmlFor="profile-bio" className="text-sm font-semibold">Bio <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <textarea id="profile-bio" {...register("bio")} rows={3}
                      className="w-full resize-y rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      placeholder="Share a little about your interests and goals..." />
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <Building2 className="size-3.5" /> Learning profile
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="profile-institution" className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-muted-foreground" /> Institution / company</label>
                      <input id="profile-institution" type="text" {...register("institution")} className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="e.g. Stanford University" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="profile-role" className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="size-4 text-muted-foreground" /> Primary role</label>
                      <select id="profile-role" {...register("role")} className="h-11 w-full cursor-pointer rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10">
                        <option value="student">Student</option>
                        <option value="professional">Professional Developer</option>
                        <option value="educator">Educator</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-6">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold">Connected accounts</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Authorize with each service to link it to this CodeSkill account.</p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card text-foreground">
                            {user.githubId && user.profile?.githubAvatarUrl ? <img src={user.profile.githubAvatarUrl} alt={`${user.profile.githubUsername || "GitHub"} avatar`} className="size-full object-cover" referrerPolicy="no-referrer" /> : <Code2 className="size-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">GitHub</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {user.githubId ? `Connected${user.profile?.githubUsername ? ` as @${user.profile.githubUsername}` : ""}` : "Not connected"}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {user.githubId && user.profile?.githubUrl && <a href={user.profile.githubUrl} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">View profile</a>}
                          <button type="button" onClick={() => handleSocialAccountConnect("github")} disabled={isLinking !== null} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                            {isLinking === "github" && <Spinner className="size-3.5 animate-spin" />}
                            {user.githubId ? "Reconnect" : "Connect GitHub"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <Code2 className="size-3.5" /> Coding preference
                  </div>
                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold">Preferred language</legend>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {["python", "cpp", "java", "javascript"].map((lang) => (
                        <label key={lang} className="relative cursor-pointer">
                          <input type="radio" value={lang} {...register("preferredLanguage")} className="peer sr-only" />
                          <span className="flex h-11 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium capitalize transition hover:border-primary/50 hover:bg-muted/60 peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/15">
                            {lang === "cpp" ? "C++" : lang}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Your profile helps personalize your CodeSkill experience.</p>
                  <button disabled={isSaving} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60">
                    {isSaving ? <><Spinner className="size-4 animate-spin" /> Saving changes...</> : <>Save changes <ArrowRight className="size-4" /></>}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
