"use client";

import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Code2,
  ClipboardList,
  Trophy,
  BarChart3,
  LayoutDashboard,
  User,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 10);
  });

  // Automatically close mobile menu on route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Automatically close mobile menu on Escape key press
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Automatically close mobile menu when viewport width expands to desktop (1024px and above)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent background body scroll while the mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen]);

  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isAdminPage = pathname ? pathname.startsWith("/admin") : false;
  const isWorkspacePage = pathname ? pathname.match(/^\/(problems|contest)\/[^/]+$/) : false;
  const isExamTakingPage = pathname ? (pathname.includes("/take") || pathname.endsWith("/attempt")) : false;

  if (!mounted || isAuthPage || isAdminPage || isWorkspacePage || isExamTakingPage) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const navLinks = [
    { name: "Problems", href: "/problems", icon: Code2 },
    { name: "Assessments", href: "/assessments", icon: ClipboardList },
    { name: "Contests", href: "/contests", icon: Trophy },
    { name: "Contests Leaderboard", href: "/contests/leaderboard", icon: BarChart3 },
    { name: "Leaderboard", href: "/leaderboard", icon: BarChart3 },
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  ];

  return (
    <>
      <header className="fixed top-2.5 sm:top-3 left-0 right-0 z-50 px-3 sm:px-6 max-w-[1440px] mx-auto transition-all duration-200">
        <div
          className={`w-full bg-background/95 dark:bg-[#121212]/96 backdrop-blur-md border border-black/8 dark:border-white/10 rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.30)] px-3 sm:px-4 lg:px-5 h-[56px] flex items-center justify-between transition-all duration-200 ${
            scrolled
              ? "bg-background dark:bg-[#0a0a0a]/98 border-black/10 dark:border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
              : ""
          }`}
        >
          {/* 1. LEFT — BRAND */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0 select-none">
            {/* CodeSkill Primary Logo */}
            <div className="relative w-8.5 h-8.5 rounded-lg overflow-hidden bg-slate-950 border border-black/10 dark:border-white/15 shadow-xs flex items-center justify-center p-1 group-hover:scale-105 transition-all duration-300 z-10">
              <svg viewBox="0 0 160 160" className="w-full h-full" fill="none">
                <polygon
                  points="80,10 145,45 145,115 80,150 15,115 15,45"
                  fill="#0F172A"
                  stroke="#FFFFFF"
                  strokeWidth="8"
                  strokeLinejoin="round"
                />
                <path
                  d="M60 62 L40 80 L60 98"
                  stroke="#FFFFFF"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M85 55 L75 105"
                  stroke="#FFFFFF"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d="M100 62 L120 80 L100 98"
                  stroke="#38BDF8"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="flex flex-col justify-center">
              <span className="font-bold text-[18px] sm:text-[19px] tracking-tight leading-none text-foreground">
                CodeSkill
              </span>
            </div>
          </Link>

          {/* 2. CENTER — NAVIGATION (Desktop 1024px and above) */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 shrink-0">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" &&
                  pathname.startsWith(`${item.href}/`) &&
                  !(item.href === "/contests" && pathname.startsWith("/contests/leaderboard")));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`relative flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 xl:py-2 rounded-lg text-[13px] xl:text-[14px] whitespace-nowrap shrink-0 transition-all duration-150 ${
                    isActive
                      ? "text-foreground bg-black/[0.04] border border-black/8 dark:text-white dark:bg-white/[0.08] font-bold dark:border-white/10 shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:text-muted-foreground dark:hover:text-white dark:hover:bg-white/[0.04] font-medium border border-transparent"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0 transition-colors duration-150 ${
                      isActive
                        ? "text-primary dark:text-[#3B82F6]"
                        : "text-muted-foreground group-hover:text-foreground dark:text-muted-foreground dark:group-hover:text-white"
                    }`}
                  />
                  <span className="whitespace-nowrap">{item.name}</span>

                  {isActive && (
                    <motion.span
                      layoutId="activeNavIndicator"
                      className="absolute -bottom-[5px] left-3.5 right-3.5 h-[2px] bg-primary rounded-full shadow-[0_0_6px_rgba(37,99,235,0.4)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* 3. RIGHT SIDE — Theme Toggle, Log In & Get Started (Desktop only >= 1024px) */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
            <ThemeToggle className="w-8.5 h-8.5 shrink-0" />

            {user ? (
              <div className="flex items-center gap-1.5 xl:gap-2 shrink-0">
                {user.isAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="inline-flex items-center gap-1.5 h-8.5 xl:h-9 px-2.5 xl:px-3 rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-200 hover:bg-neutral-900 hover:text-white dark:bg-white/10 dark:text-white dark:border-white/15 dark:hover:bg-white dark:hover:text-black transition-all duration-150 whitespace-nowrap shrink-0"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                    <span className="whitespace-nowrap">Admin</span>
                  </Link>
                )}
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 h-8.5 xl:h-9 px-2.5 xl:px-3 rounded-lg text-[13px] xl:text-[14px] font-medium text-neutral-800 bg-neutral-100/80 hover:bg-neutral-200/80 border border-neutral-200 dark:text-foreground dark:bg-white/[0.05] dark:hover:bg-white/[0.1] dark:border-white/10 transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  <User className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-neutral-500 dark:text-muted-foreground shrink-0" />
                  <span className="whitespace-nowrap">{user.name?.split(" ")[0] || "Profile"}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center h-8.5 w-8.5 xl:h-9 xl:w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-neutral-100 border border-neutral-200 dark:text-muted-foreground dark:hover:text-white dark:hover:bg-white/[0.06] dark:border-white/10 transition-colors duration-150 cursor-pointer shrink-0"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 xl:gap-2.5 shrink-0">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center h-8.5 xl:h-9 px-2.5 xl:px-3.5 rounded-lg text-[13.5px] xl:text-[15px] font-medium text-muted-foreground hover:text-foreground dark:text-foreground/90 dark:hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  Log In
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-1.5 h-8.5 xl:h-9 px-3 xl:px-4 rounded-xl text-[13.5px] xl:text-[15px] font-bold bg-foreground hover:bg-[#262626] text-background shadow-xs hover:shadow dark:bg-white dark:hover:bg-neutral-200 dark:text-black transition-all duration-150 whitespace-nowrap shrink-0"
                >
                  <span className="whitespace-nowrap">Get Started</span>
                  <ArrowRight className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                </Link>
              </div>
            )}
          </div>

          {/* 4. MOBILE / TABLET RIGHT CONTROLS: Theme Toggle + Hamburger (< 1024px) */}
          <div className="lg:hidden flex items-center gap-2 shrink-0">
            <ThemeToggle className="w-8.5 h-8.5 shrink-0" />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center justify-center w-8.5 h-8.5 rounded-lg text-neutral-800 dark:text-foreground hover:bg-neutral-100 dark:hover:bg-white/[0.08] border border-neutral-200 dark:border-white/10 transition-colors shrink-0"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Backdrop & Compact Dropdown Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] lg:hidden"
              aria-hidden="true"
            />

            {/* Compact Dropdown Drawer */}
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed top-[66px] sm:top-[70px] right-3 sm:right-6 z-50 w-[calc(100vw-24px)] sm:w-[360px] max-w-sm max-h-[calc(100vh-85px)] overflow-y-auto bg-background/98 dark:bg-[#141414]/98 backdrop-blur-2xl border border-black/10 dark:border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.65)] flex flex-col gap-3 lg:hidden"
            >
              <div className="flex flex-col gap-1">
                <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Navigation
                </div>
                {navLinks.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" &&
                      pathname.startsWith(`${item.href}/`) &&
                      !(item.href === "/contests" && pathname.startsWith("/contests/leaderboard")));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors ${
                        isActive
                          ? "text-foreground bg-black/[0.05] dark:text-white dark:bg-white/[0.08] font-bold border border-black/5 dark:border-white/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03] dark:hover:text-white dark:hover:bg-white/[0.04] font-medium"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? "text-primary dark:text-[#3B82F6]" : "text-muted-foreground"
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="pt-2.5 border-t border-black/8 dark:border-white/10 flex flex-col gap-2">
                {user ? (
                  <>
                    <div className="px-3 py-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Account
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
                        {user.name || user.email}
                      </span>
                    </div>
                    {user.isAdmin && (
                      <Link
                        href="/admin/dashboard"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-center gap-2 w-full h-9.5 rounded-xl bg-neutral-100 text-neutral-900 font-semibold border border-neutral-200 dark:bg-white/10 dark:text-white dark:border-white/15 text-xs transition-colors hover:bg-neutral-200 dark:hover:bg-white/15"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Admin Portal</span>
                      </Link>
                    )}
                    <Link
                      href="/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 w-full h-9.5 rounded-xl bg-neutral-100/80 text-neutral-800 dark:bg-white/[0.05] dark:text-foreground font-medium text-xs border border-neutral-200 dark:border-white/10 transition-colors hover:bg-neutral-200/80 dark:hover:bg-white/[0.1]"
                    >
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Profile Settings</span>
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center justify-center gap-2 w-full h-9.5 rounded-xl border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-medium text-xs transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-1.5 w-full h-10 rounded-xl bg-foreground text-background dark:bg-white dark:text-black font-bold text-[14px] shadow-xs hover:opacity-95 transition-all"
                    >
                      <span>Get Started</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center w-full h-9.5 rounded-xl bg-muted/80 text-foreground hover:bg-muted font-medium text-[14px] border border-border transition-colors"
                    >
                      Log In
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default Navbar;
