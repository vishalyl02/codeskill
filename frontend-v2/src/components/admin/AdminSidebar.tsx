"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Home,
  Code2, 
  Trophy, 
  Building2, 
  GraduationCap, 
  Settings,
  ExternalLink,
  ClipboardList,
  ListChecks,
  Award,
  BookOpen,
  BarChart3,
  CircleHelp,
  Bug,
  Compass,
  X,
} from "lucide-react";
import gsap from "gsap";

const adminNavItems = [
  { name: "Home", href: "/", icon: Home },
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  {
    name: "Learning Studio",
    href: "/admin/learning",
    icon: Compass,
    subItems: [
      { name: "Overview", href: "/admin/learning" },
      { name: "Learning Paths", href: "/admin/learning/paths" },
    ],
  },
  {
    name: "Students",
    href: "/admin/students",
    icon: GraduationCap,
    subItems: [
      { name: "All Students", href: "/admin/students" },
      { name: "Import Students", href: "/admin/students/import" },
      { name: "Credentials", href: "/admin/students/credentials" },
    ],
  },
  {
    name: "Question Bank",
    href: "/admin/questions",
    icon: Code2,
    subItems: [
      { name: "All Questions", href: "/admin/questions" },
      { name: "Create Question", href: "/admin/questions/create" },
      { name: "Bulk Import", href: "/admin/questions/import" },
      { name: "Pending Review", href: "/admin/questions/pending" },
      { name: "Topics", href: "/admin/questions/topics" },
    ],
  },
  { name: "MCQs", href: "/admin/mcqs", icon: ListChecks },
  {
    name: "Assessments",
    href: "/admin/assessments",
    icon: ClipboardList,
    subItems: [
      { name: "All Assessments", href: "/admin/assessments" },
      { name: "Create Assessment", href: "/admin/assessments/create" },
    ],
  },
  {
    name: "Practice Problems",
    href: "/admin/problems",
    icon: Code2,
    subItems: [
      { name: "All Problems", href: "/admin/problems" },
      { name: "Create Problem", href: "/admin/problems/create" },
    ],
  },
  { name: "Results & Scores", href: "/admin/candidates", icon: BarChart3 },
  { name: "Contests", href: "/admin/contests", icon: Trophy },
  { name: "FAQ", href: "/admin/faq", icon: CircleHelp },
  { name: "Bugs", href: "/admin/bugs", icon: Bug },
  { name: "Contest Results", href: "/admin/contest-results", icon: Award },
  { name: "Companies", href: "/admin/companies", icon: Building2 },
  { name: "Universities", href: "/admin/universities", icon: BookOpen },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

const teacherNavItems = adminNavItems.filter((item) =>
  !["Companies", "Universities", "Settings", "Bugs"].includes(item.name),
);

interface AdminSidebarProps {
  portal?: "admin" | "teacher";
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AdminSidebar({
  portal = "admin",
  mobileOpen = false,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const navItems = portal === "teacher" ? teacherNavItems : adminNavItems;
  const isTeacher = portal === "teacher";

  const renderSidebarContent = (isMobileView = false) => (
    <>
      <div className="h-[72px] flex items-center justify-between px-4 border-b border-border bg-card/60 shrink-0">
        <Link
          href={isTeacher ? "/teacher/dashboard" : "/admin/dashboard"}
          onClick={() => onMobileClose?.()}
          className="flex items-center gap-2.5 group select-none min-w-0"
        >
          <div
            className="relative w-9 h-9 rounded-xl overflow-hidden bg-slate-950 border border-border/80 shadow-xs flex items-center justify-center p-1 shrink-0 transition-transform duration-200 group-hover:scale-105"
            title="CodeSkill"
          >
            <img
              src="/icon.svg"
              alt="CodeSkill Logo"
              className="w-full h-full object-contain block"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-foreground leading-none">
                Code<span className="text-emerald-700 dark:text-emerald-400">Skill</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none shadow-xs bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
                {isTeacher ? "Teacher" : "Admin"}
              </span>
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mt-1 truncate">
              Department of Skill Development
            </p>
          </div>
        </Link>

        {isMobileView && (
          <button
            type="button"
            onClick={onMobileClose}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-2 cursor-pointer shrink-0"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="admin-sidebar-scroll flex-1 overflow-y-auto py-4 px-3">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const href = isTeacher ? item.href.replace(/^\/admin\//, "/teacher/") : item.href;
            const isCategoryActive = pathname === href || (href !== "/" && Boolean(pathname?.startsWith(href)));
            const Icon = item.icon;
            
            return (
              <div key={item.name} className="admin-nav-group space-y-1">
                <Link
                  href={href}
                  onClick={() => onMobileClose?.()}
                  className={`admin-nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium leading-5 transition-colors ${
                    isCategoryActive 
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : "hover:bg-muted/40 hover:text-foreground border border-transparent"
                  }`}
                  onMouseEnter={(e) => {
                    const icon = e.currentTarget.querySelector("svg");
                    if (icon) gsap.to(icon, { x: 3, duration: 0.2 });
                  }}
                  onMouseLeave={(e) => {
                    const icon = e.currentTarget.querySelector("svg");
                    if (icon) gsap.to(icon, { x: 0, duration: 0.2 });
                  }}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isCategoryActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.name}
                </Link>

                {item.subItems && isCategoryActive && (
                  <div className="admin-subnav pl-8 pr-2 pb-1 space-y-1">
                    {item.subItems.map((sub) => {
                      const subHref = isTeacher ? sub.href.replace(/^\/admin\//, "/teacher/") : sub.href;
                      const isSubActive = pathname === subHref;
                      return (
                        <Link
                          key={sub.name}
                          href={subHref}
                          onClick={() => onMobileClose?.()}
                          className={`admin-subnav-link block px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            isSubActive
                              ? "bg-primary/15 text-primary font-bold"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                          }`}
                          onMouseEnter={(e) => gsap.to(e.currentTarget, { x: 2, duration: 0.2 })}
                          onMouseLeave={(e) => gsap.to(e.currentTarget, { x: 0, duration: 0.2 })}
                        >
                          {sub.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {!isTeacher && (
          <>
            <div className="mt-6 mb-2 px-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
              Portals
            </div>
            <nav className="space-y-0.5">
              <Link
                href="/company"
                target="_blank"
                onClick={() => onMobileClose?.()}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium leading-5 hover:bg-primary/10 hover:text-primary transition-colors group text-muted-foreground"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 group-hover:text-primary" />
                  Company Portal
                </div>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
              <Link
                href="/campus"
                target="_blank"
                onClick={() => onMobileClose?.()}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium leading-5 hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors group text-muted-foreground"
              >
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-4 h-4 group-hover:text-emerald-500" />
                  Campus Portal
                </div>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </nav>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="admin-sidebar hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground h-full border-r border-sidebar-border shrink-0 z-20">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground z-50 flex flex-col h-full shadow-2xl border-r border-sidebar-border md:hidden animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </aside>
        </>
      )}
    </>
  );
}
