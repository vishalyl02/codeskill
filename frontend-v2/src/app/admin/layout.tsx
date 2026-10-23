"use client";

import { usePathname, useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

import { authAPI } from "@/config/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDown, ChevronRight, UserCog, SlidersHorizontal, LogOut, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, updateUserLocal, logout } = useAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      if (loading) return;

      const token = typeof window !== "undefined" ? localStorage.getItem("codeskill_token") : null;

      if (isLoginPage) {
        if (user && user.isAdmin) {
          router.replace("/admin/dashboard");
        } else if (token) {
          try {
            const res = await authAPI.getMe();
            const freshUser = res.data?.user;
            if (freshUser && freshUser.isAdmin) {
              updateUserLocal(freshUser);
              router.replace("/admin/dashboard");
              return;
            }
          } catch (_) {
            // invalid token
          }
          setIsVerifying(false);
        } else {
          setIsVerifying(false);
        }
        return;
      }

      if (user && user.isAdmin) {
        if (isMounted) setIsVerifying(false);
        return;
      }

      if (token) {
        try {
          const res = await authAPI.getMe();
          const freshUser = res.data?.user;
          if (
            freshUser &&
            (freshUser.isAdmin ||
              ["admin", "super_admin", "assessment_admin"].includes(freshUser.role))
          ) {
            updateUserLocal(freshUser);
            if (isMounted) setIsVerifying(false);
            return;
          } else {
            router.replace("/dashboard");
            return;
          }
        } catch (err) {
          router.replace("/admin/login");
          return;
        }
      }


      router.replace("/admin/login");
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [user, loading, router, isLoginPage, updateUserLocal]);

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  const userName = user?.name?.trim() || "Administrator";
  const userInitial = userName.charAt(0).toUpperCase();
  const userEmail = user?.email || "Email unavailable";
  const userRole = user?.role ? (user.role === "admin" ? "Admin" : user.role) : "Admin";

  if (loading || isVerifying) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell flex h-screen bg-background overflow-hidden font-sans">
      <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Standardized Admin Header with CodeSkill Branding & Theme Toggle */}
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

          {/* Desktop CU Branding & Department of Skill Development */}
          <div className="hidden md:flex items-center gap-3 min-w-0">
            <div
              className="flex items-center h-[38px] px-2.5 py-1 rounded-xl bg-white border border-border shadow-xs shrink-0"
              title="Chandigarh University"
            >
              <img
                src="/cu-logo-tight.png"
                alt="Chandigarh University"
                className="h-full w-auto object-contain block max-h-[30px]"
              />
            </div>
            <span className="inline-block h-5 w-[1.5px] bg-border shrink-0" aria-hidden="true" />
            <p className="min-w-0 truncate text-sm font-semibold tracking-wide text-foreground">
              Department of Skill Development
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-auto">
            <ThemeToggle />

            <div className="pl-1 sm:pl-2 border-l border-border">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Account menu for ${userName}`}
                  openOnHover
                  delay={100}
                  closeDelay={150}
                  className="flex items-center gap-2.5 p-1.5 sm:px-2.5 rounded-xl border border-transparent hover:border-border/80 hover:bg-muted/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 group select-none text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-amber-500/15 shadow-2xs">
                    {userInitial}
                  </div>
                  <div className="hidden lg:block min-w-0 max-w-60">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground leading-tight truncate">
                        {userName}
                      </p>
                      <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                        ({userRole})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 font-medium leading-none mt-1 truncate">
                      Examination Controller
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180 shrink-0 ml-0.5" />
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-[290px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-popover/98 dark:bg-[#141416]/98 backdrop-blur-2xl border border-border/80 dark:border-white/[0.08] p-1.5 shadow-2xl shadow-black/50 dark:shadow-black/70 ring-1 ring-white/[0.03] z-50 text-foreground outline-none"
                >
                  {/* User Profile Header */}
                  <div className="p-3 mb-1 bg-muted/40 dark:bg-white/[0.03] rounded-xl border border-border/60 dark:border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/35 text-amber-500 dark:text-amber-400 flex items-center justify-center font-bold text-sm shrink-0 ring-2 ring-amber-500/15 shadow-2xs">
                        {userInitial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground tracking-tight leading-snug break-words">
                          {userName}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 font-normal break-all leading-tight mt-0.5">
                          {userEmail}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-zinc-800/90 dark:bg-white/[0.08] text-zinc-300 dark:text-zinc-200 border border-zinc-700/60 dark:border-white/[0.08] rounded-md shrink-0 shadow-2xs">
                            {userRole}
                          </span>
                          <span className="text-[11px] text-muted-foreground/90 font-medium truncate leading-none">
                            Examination Controller
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Group */}
                  <DropdownMenuGroup className="space-y-0.5 py-0.5">
                    <DropdownMenuItem
                      onClick={() => router.push("/profile")}
                      className="group/item flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium rounded-xl text-foreground/90 hover:text-foreground hover:bg-muted/70 dark:hover:bg-white/[0.06] focus:bg-muted/70 dark:focus:bg-white/[0.06] transition-all cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserCog className="w-4 h-4 text-muted-foreground group-hover/item:text-foreground group-focus/item:text-foreground transition-colors shrink-0" />
                        <span className="truncate">Profile Settings</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover/item:text-muted-foreground/80 group-hover/item:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => router.push("/profile")}
                      className="group/item flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium rounded-xl text-foreground/90 hover:text-foreground hover:bg-muted/70 dark:hover:bg-white/[0.06] focus:bg-muted/70 dark:focus:bg-white/[0.06] transition-all cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SlidersHorizontal className="w-4 h-4 text-muted-foreground group-hover/item:text-foreground group-focus/item:text-foreground transition-colors shrink-0" />
                        <span className="truncate">Account Preferences</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover/item:text-muted-foreground/80 group-hover/item:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  {/* Refined Divider */}
                  <DropdownMenuSeparator className="my-1 mx-1 bg-border/60 dark:bg-white/[0.08]" />

                  {/* Log Out Action */}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleLogout}
                    className="group/logout flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-xl text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-600 dark:focus:text-rose-300 transition-colors cursor-pointer select-none"
                  >
                    <LogOut className="w-4 h-4 text-rose-500/90 dark:text-rose-400/90 group-hover/logout:text-rose-600 dark:group-hover/logout:text-rose-300 transition-colors shrink-0" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="admin-main flex-1 overflow-y-auto relative">
          {children}
        </main>
      </div>
    </div>
  );
}
