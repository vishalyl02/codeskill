"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Eye, FileText, GraduationCap, Settings, Shield } from "lucide-react";

const sections = [
  { id: "basic-information", label: "Basic Information", Icon: Settings },
  { id: "configuration", label: "Configuration & Proctoring", Icon: Clock },
  { id: "desktop-security", label: "Desktop Security & LockDown Browser", Icon: Shield },
  { id: "student-access", label: "Student access & timing", Icon: GraduationCap },
  { id: "result-visibility", label: "Candidate Result Visibility Policy", Icon: Eye },
  { id: "assessment-sections", label: "Assessment Sections", Icon: FileText },
];

export default function AssessmentSectionNavigation() {
  const navRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => {
    const scroller = navRef.current?.closest("main");
    const sectionElements = sections.flatMap(({ id }) => {
      const element = document.getElementById(id);
      return element ? [element] : [];
    });
    if (!scroller || !sectionElements.length) return;

    const updateActiveSection = () => {
      const scrollMargin = parseFloat(getComputedStyle(sectionElements[0]).scrollMarginTop) || 0;
      const activationLine = scroller.getBoundingClientRect().top + scrollMargin + 16;
      const reachedBottom = scroller.scrollTop > 0 && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 2;
      let visibleSection = sectionElements[0];
      for (const section of sectionElements) {
        if (!reachedBottom && section.getBoundingClientRect().top > activationLine) break;
        visibleSection = section;
      }
      setActiveSection(visibleSection.id);
    };
    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActiveSection);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    observer?.observe(scroller);
    sectionElements.forEach((section) => observer?.observe(section));

    const initialSection = sectionElements.find((section) => "#" + section.id === window.location.hash);
    initialSection?.scrollIntoView?.({ block: "start" });
    updateActiveSection();
    scroller.addEventListener("scroll", scheduleUpdate, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", scheduleUpdate);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const list = navRef.current?.querySelector("ul");
    const activeLink = list?.querySelector('[aria-current="location"]');
    if (!list || !activeLink || list.scrollWidth <= list.clientWidth) return;
    const listBounds = list.getBoundingClientRect();
    const linkBounds = activeLink.getBoundingClientRect();
    if (linkBounds.left < listBounds.left) list.scrollLeft += linkBounds.left - listBounds.left;
    if (linkBounds.right > listBounds.right) list.scrollLeft += linkBounds.right - listBounds.right;
  }, [activeSection]);

  return (
    <nav ref={navRef} aria-label="Assessment settings" className="sticky top-0 z-20 min-w-0 rounded-xl border border-border bg-card p-1 lg:top-16">
      <ul className="flex gap-0.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {sections.map(({ id, label, Icon }) => (
          <li key={id} className="shrink-0 lg:shrink">
            <a
              href={`#${id}`}
              aria-current={activeSection === id ? "location" : undefined}
              onClick={() => setActiveSection(id)}
              className="flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary aria-[current=location]:border-primary/25 aria-[current=location]:bg-primary/10 aria-[current=location]:font-semibold aria-[current=location]:text-foreground dark:aria-[current=location]:text-white lg:whitespace-normal"
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
