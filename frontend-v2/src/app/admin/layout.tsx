"use client";

import { usePathname, useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

import { authAPI } from "@/config/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDown, UserCog, SlidersHorizontal, LogOut, Menu } from "lucide-react";
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
                  className="flex items-center gap-2 sm:gap-3 p-1.5 sm:px-2.5 rounded-xl border border-transparent hover:border-border hover:bg-muted/60 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 group select-none text-left"
                >
                  <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ring-1 ring-amber-500/10">
                    {userInitial}
                  </div>
                  <div className="hidden lg:block min-w-0 max-w-60">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground leading-none truncate">
                        {userName}
                      </p>
                      <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                        ({userRole})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium mt-1">
                      Examination Controller
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180 ml-0.5 shrink-0" />
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-72 max-w-[calc(100vw-1rem)] bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl shadow-slate-900/10 dark:shadow-black/40 p-2 z-50 text-foreground"
                >
                  {/* User Header Section: Show user full name, role, and email address */}
                  <div className="px-3 py-3 mb-1.5 bg-muted/40 rounded-xl border border-border/50">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
                        {userInitial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground break-words">
                          {userName}
                        </p>
                        <p className="text-[11px] text-muted-foreground break-all">
                          {userEmail}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 rounded">
                            {userRole}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium truncate">
                            Examination Controller
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => router.push("/profile")}
                      className="cursor-pointer gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-xl hover:bg-muted focus:bg-muted text-foreground transition-colors"
                    >
                      <UserCog className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>Profile Settings</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => router.push("/profile")}
                      className="cursor-pointer gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-xl hover:bg-muted focus:bg-muted text-foreground transition-colors"
                    >
                      <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>Account Preferences</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator className="my-1 bg-border/80" />

                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleLogout}
                    className="cursor-pointer gap-2.5 px-3 py-2.5 text-[13px] font-semibold rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
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
