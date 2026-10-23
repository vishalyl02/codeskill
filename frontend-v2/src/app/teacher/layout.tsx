"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ChevronDown, LogOut, SlidersHorizontal, UserCog, Menu } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TEACHER_ROLES = new Set(["teacher", "faculty", "instructor"]);

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isTeacher = Boolean(user && (user.isTeacher || TEACHER_ROLES.has(String(user.role || "").toLowerCase())));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!isTeacher) {
      router.replace(user.isAdmin ? "/admin/dashboard" : "/dashboard");
    }
  }, [isTeacher, loading, pathname, router, user]);

  if (loading || !isTeacher) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const authenticatedUser = user!;
  const userName = authenticatedUser.name?.trim() || "Teacher";
  const initial = userName.charAt(0).toUpperCase();

  return (
    <div className="admin-shell flex h-screen overflow-hidden bg-background font-sans">
      <AdminSidebar portal="teacher" mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-card/90 backdrop-blur-md border-b border-border h-[72px] flex items-center justify-between gap-3 px-3 sm:px-6 sticky top-0 z-10 shrink-0 shadow-xs">
          {/* Mobile hamburger menu & CodeSkill branding */}
          <div className="flex items-center gap-2.5 md:hidden min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-slate-950 border border-border/80 flex items-center justify-center p-0.5 shrink-0 shadow-xs">
                <img src="/icon.svg" alt="CodeSkill" className="w-full h-full object-contain" />
              </div>
              <span className="text-sm font-bold text-foreground truncate">
                Code<span className="text-emerald-700 dark:text-emerald-400">Skill</span>
              </span>
            </div>
          </div>

          <div className="hidden min-w-0 items-center gap-4 md:flex">
            <p className="min-w-0 truncate text-base font-semibold tracking-[0.01em] text-foreground md:text-[17px]">Chandigarh University • Department of Skill Development</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <div className="border-l border-border pl-1 sm:pl-2">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label={`Account menu for ${userName}`} openOnHover delay={100} closeDelay={150} className="group flex cursor-pointer items-center gap-2 rounded-xl border border-transparent p-1.5 text-left transition hover:border-border hover:bg-muted/60 sm:gap-3 sm:px-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-xs font-bold text-amber-600 dark:text-amber-400">{initial}</div>
                  <div className="hidden min-w-0 max-w-60 lg:block">
                    <p className="truncate text-xs font-semibold leading-none text-foreground">{userName} <span className="text-[10px] text-muted-foreground">(Teacher)</span></p>
                    <p className="mt-1 text-[10px] font-medium text-muted-foreground">Teacher Portal</p>
                  </div>
                  <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground group-data-[popup-open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="z-50 w-72 rounded-2xl border border-border/80 bg-card/95 p-2 text-foreground shadow-2xl backdrop-blur-xl">
                  <div className="mb-1.5 rounded-xl border border-border/50 bg-muted/40 px-3 py-3">
                    <p className="text-xs font-bold">{userName}</p>
                    <p className="mt-0.5 break-all text-[11px] text-muted-foreground">{authenticatedUser.email}</p>
                    <span className="mt-1 inline-flex rounded border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Teacher</span>
                  </div>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium"><UserCog className="h-4 w-4 text-muted-foreground" />Profile Settings</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" />Account Preferences</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="my-1 bg-border/80" />
                  <DropdownMenuItem onClick={() => { logout(); router.push("/login"); }} className="cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-rose-600 dark:text-rose-400"><LogOut className="h-4 w-4" />Log Out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main className="admin-main min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
