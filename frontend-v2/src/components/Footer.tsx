"use client";

import { usePathname } from "next/navigation";
import { CodeSkillFooterAnimation } from "@/components/ui/codeskill-footer-animation";

export function Footer() {
  const pathname = usePathname();

  const isHidden =
    !pathname ||
    pathname.startsWith("/admin") ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.includes("/take") ||
    pathname.endsWith("/attempt") ||
    pathname.match(/^\/(problems|contest)\/[^/]+$/);

  if (isHidden) return null;

  return (
    <div className="w-full bg-background mt-auto print:hidden">
      <CodeSkillFooterAnimation brandName="CodeSkill" />
    </div>
  );
}

export default Footer;
