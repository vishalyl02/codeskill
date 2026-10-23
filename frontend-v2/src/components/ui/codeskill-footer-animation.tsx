"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface CodeSkillFooterAnimationProps {
  className?: string;
  brandName?: string;
}

export function CodeSkillFooterAnimation({
  className = "",
  brandName = "CodeSkill",
}: CodeSkillFooterAnimationProps) {
  const footerRef = useRef<HTMLElement>(null);
  const giantRef = useRef<HTMLDivElement>(null);
  const giantTxtRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<SVGCircleElement>(null);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const [deptText, setDeptText] = useState("Department of Skill Development");
  const [isInView, setIsInView] = useState(false);

  // Maintain official department designation
  useEffect(() => {
    setDeptText("Department of Skill Development");
  }, []);

  // Intersection Observer to trigger reveal animations on entering viewport
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      footer.classList.add("in");
      giantRef.current?.classList.add("in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            footer.classList.add("in");
            giantRef.current?.classList.add("in");
          }
        });
      },
      { threshold: 0.08 }
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  // Full-Screen Edge-to-Edge auto-fit calculation matching codeskill-footer-animation.html
  useEffect(() => {
    const fit = () => {
      const giant = giantRef.current;
      const txt = giantTxtRef.current;
      if (!giant || !txt) return;

      giant.style.setProperty("--fs", "100px");
      const w = txt.getBoundingClientRect().width;
      if (w > 0) {
        // Expand text to 98.5% of full viewport container width
        const newFs = (100 * giant.clientWidth / w) * 0.985;
        giant.style.setProperty("--fs", `${newFs}px`);
      }
    };

    fit();
    const t1 = setTimeout(fit, 80);
    const t2 = setTimeout(fit, 300);
    window.addEventListener("resize", fit, { passive: true });
    window.addEventListener("load", fit, { passive: true });
    if (document.fonts?.ready) {
      document.fonts.ready.then(fit);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", fit);
      window.removeEventListener("load", fit);
    };
  }, []);

  // Scroll Progress and Circular Back to Top Button
  useEffect(() => {
    const circleRadius = 22;
    const circumference = 2 * Math.PI * circleRadius;

    const handleScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;

      if (barRef.current) {
        barRef.current.style.strokeDashoffset = String(
          circumference * (1 - progress)
        );
      }

      setShowTopBtn(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Mouse radial glow gradient coordinates on footer
  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const footer = footerRef.current;
    if (!footer) return;
    const rect = footer.getBoundingClientRect();
    footer.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    footer.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const giantWord = brandName || "CodeSkill";
  const giantLetters = giantWord.split("");

  return (
    <>
      <footer
        ref={footerRef}
        id="footer"
        onPointerMove={handlePointerMove}
        className={cn(
          "codeskill-custom-footer relative w-full",
          isInView ? "in" : "",
          className
        )}
      >
        {/* Top Edge Ambient Gradient Line */}
        <span className="edge" aria-hidden="true" />

        {/* 5-Column Grid */}
        <div className="grid">
          {/* Brand & Institution Column */}
          <div>
            <div className="brand-row">
              <div className="cu-logo-wrap">
                <img
                  src="/chandigarh-university-logo.png"
                  alt="Chandigarh University"
                  className="cu-logo-img"
                  loading="lazy"
                />
              </div>

              <span className="brand-divider" aria-hidden="true" />

              <div className="codeskill-logo-wrap">
                <img
                  src="/codeskill-logo.png"
                  alt="CodeSkill"
                  className="codeskill-logo-img"
                  loading="lazy"
                />
              </div>
            </div>

            <div
              className="dept"
              aria-label="Department of Skill Development"
            >
              <svg
                className="ic"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 10L12 5 2 10l10 5 10-5z" />
                <path d="M6 12v5c3 2 9 2 12 0v-5" />
              </svg>
              <span className="dept-text">{deptText}</span>
              <span className="dept-cursor" aria-hidden="true" />
            </div>

            <p className="desc">
              Standardized examination portal and algorithmic skill-building platform engineered for developers, students, and technical evaluations.
            </p>

            <div className="verify">
              <span className="pulse">
                <svg
                  className="ic"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              <span>Proctored &amp; Verified Examination Infrastructure</span>
            </div>
          </div>

          {/* Column 2: Platform */}
          <div>
            <h4>Platform</h4>
            <ul>
              <li>
                <Link href="/assessments">Assessments</Link>
              </li>
              <li>
                <Link href="/problems">Coding Problems</Link>
              </li>
              <li>
                <Link href="/leaderboard">Campus Leaderboard</Link>
              </li>
              <li>
                <Link href="/login">Student Dashboard</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Preparation & Tracks */}
          <div>
            <h4>Preparation &amp; Tracks</h4>
            <ul>
              <li>
                <Link href="/problems">Data Structures &amp; Algorithms</Link>
              </li>
              <li>
                <Link href="/problems">Dynamic Programming</Link>
              </li>
              <li>
                <Link href="/assessments">Interview Evaluation</Link>
              </li>
              <li>
                <Link href="/contests">Campus Contests</Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Institutional & Legal */}
          <div>
            <h4>Institutional &amp; Legal</h4>
            <ul>
              <li>
                <Link href="/skill-development">Skill Development</Link>
              </li>
              <li>
                <Link href="/contact">Help &amp; Contact</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms of Examination</Link>
              </li>
              <li>
                <Link href="/admin">Faculty / Controller Login</Link>
              </li>
            </ul>
          </div>

          {/* Column 5: Connect & Community */}
          <div>
            <h4>Connect &amp; Community</h4>
            <ul className="social">
              <li>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg className="ic" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm3 6v9h2.5V9H7zm1.2-3.6a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8zM11 9v9h2.5v-4.6c0-1.3.7-1.9 1.5-1.9s1.2.5 1.2 1.8V18h2.5v-5.2c0-2.3-1.2-3.9-3-3.9-1 0-1.8.5-2.2 1.2V9H11z" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </li>
              <li>
                <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg className="ic" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.600 7.200a2.500 2.500 0 00-1.800-1.800C18.200 5 12 5 12 5s-6.200 0-7.800.4A2.500 2.500 0 002.400 7.200C2 8.800 2 12 2 12s0 3.200.4 4.800a2.500 2.500 0 001.800 1.800C5.800 19 12 19 12 19s6.200 0 7.800-.4a2.500 2.500 0 001.800-1.800C22 15.200 22 12 22 12s0-3.200-.4-4.800zM10 15V9l5.200 3z" />
                  </svg>
                  <span>YouTube</span>
                </a>
              </li>
              <li>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    className="ic"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.500" cy="6.500" r="1" fill="currentColor" />
                  </svg>
                  <span>Instagram</span>
                </a>
              </li>
              <li>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg className="ic" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 00-1.600 19.900v-7H8v-2.900h2.400V9.800c0-2.400 1.400-3.700 3.600-3.700 1 0 2.100.2 2.100.2v2.300h-1.200c-1.200 0-1.500.7-1.500 1.500v1.800h2.600l-.4 2.900h-2.200v7A10 10 0 0012 2z" />
                  </svg>
                  <span>Facebook</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Legal Notice */}
        <div className="legal-notice">
          <p>
            &copy; {new Date().getFullYear()}{" "}CodeSkill. Department of Skill Development. All rights reserved.
          </p>
          <div className="campus-tag">
            <span>Chandigarh University, Mohali</span>
          </div>
        </div>

        {/* Giant Half-Cut Edge-to-Edge Animated Text (Full Screen) */}
        <div
          ref={giantRef}
          id="giant"
          className="giant"
          aria-hidden="true"
        >
          <div
            ref={giantTxtRef}
            id="giantTxt"
            className="txt"
          >
            {giantLetters.map((char, i) => (
              <span
                key={i}
                style={{ "--i": i } as React.CSSProperties}
              >
                {char}
              </span>
            ))}
          </div>
        </div>
      </footer>

      {/* Circular Progress Back to Top Button */}
      <button
        onClick={scrollToTop}
        aria-label="Back to top"
        className={cn("top", showTopBtn ? "show" : "")}
      >
        <svg className="ring" viewBox="0 0 48 48">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <circle className="track" cx="24" cy="24" r="22" />
          <circle
            ref={barRef}
            className="bar"
            cx="24"
            cy="24"
            r="22"
          />
        </svg>
        <svg
          className="ic"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>

      {/* Exact CSS from codeskill-footer-animation.html with Dark Mode Support */}
      <style jsx global>{`
        .codeskill-custom-footer {
          --bg: #f8f9fc;
          --ink: #0f172a;
          --muted: #475569;
          --line: #e2e8f0;
          --green: #16a34a;
          --green-bg: #dcfce7;
          --accent: #6366f1;
          --accent2: #ec4899;
          --ease: cubic-bezier(0.16, 1, 0.3, 1);
          --pad: 5vw;

          position: relative;
          width: 100%;
          margin-top: 4rem;
          scroll-margin-top: 80px;
          border-radius: 40px 40px 0 0;
          overflow: hidden;
          background: var(--bg);
          border: 1px solid var(--line);
          border-bottom: 0;
          padding: 4.5rem var(--pad) 0;
          color: var(--ink);
          box-sizing: border-box;
        }

        :global(.dark) .codeskill-custom-footer {
          --bg: #090a0f;
          --ink: #f8fafc;
          --muted: #94a3b8;
          --line: rgba(255, 255, 255, 0.08);
          --green: #22c55e;
          --green-bg: rgba(34, 197, 94, 0.12);
        }

        .codeskill-custom-footer svg.ic {
          width: 1.15em;
          height: 1.15em;
          flex: none;
          display: block;
        }

        .codeskill-custom-footer::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s;
          background: radial-gradient(
            520px circle at var(--mx, 50%) var(--my, 0%),
            rgba(99, 102, 241, 0.1),
            rgba(236, 72, 153, 0.07) 40%,
            transparent 70%
          );
        }

        .codeskill-custom-footer:hover::before {
          opacity: 1;
        }

        .codeskill-custom-footer .edge {
          position: absolute;
          top: 0;
          left: 50%;
          height: 2px;
          width: 0;
          transform: translateX(-50%);
          background: linear-gradient(
            90deg,
            transparent,
            var(--accent),
            var(--accent2),
            transparent
          );
          transition: width 1.4s var(--ease);
        }

        .codeskill-custom-footer.in .edge {
          width: 70%;
        }

        .codeskill-custom-footer .grid {
          position: relative;
          display: grid;
          grid-template-columns: minmax(420px, 2.2fr) repeat(4, 1fr);
          gap: 2.2rem;
          width: 100%;
          max-width: 100%;
          align-items: start;
        }

        @media (min-width: 1300px) {
          .codeskill-custom-footer .grid {
            grid-template-columns: minmax(500px, 2.6fr) 1fr 1.12fr 1fr 0.95fr;
          }
        }

        .codeskill-custom-footer .brand-row {
          display: flex;
          align-items: center;
          gap: 1.15rem;
          flex-wrap: wrap;
          max-width: 100%;
        }

        .codeskill-custom-footer .cu-logo-wrap {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          transition: transform 0.4s var(--ease);
        }

        .codeskill-custom-footer .cu-logo-wrap:hover {
          transform: scale(1.03);
        }

        .codeskill-custom-footer .cu-logo-img {
          height: 76px;
          width: auto;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.06));
        }

        .codeskill-custom-footer .brand-divider {
          height: 54px;
          width: 2px;
          background: #cbd5e1;
          display: inline-block;
          border-radius: 2px;
          opacity: 0.85;
          flex-shrink: 0;
        }

        .codeskill-custom-footer .codeskill-logo-wrap {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          transition: transform 0.4s var(--ease);
        }

        .codeskill-custom-footer .codeskill-logo-wrap:hover {
          transform: scale(1.03);
        }

        .codeskill-custom-footer .codeskill-logo-img {
          height: 74px;
          width: auto;
          object-fit: contain;
          display: block;
          filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.06));
        }

        .codeskill-custom-footer .dept {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin: 0.8rem 0 1.4rem;
          font-size: 1.02rem;
          font-weight: 600;
          color: var(--green);
          min-height: 1.6rem;
        }

        .codeskill-custom-footer .dept svg {
          color: var(--green);
          flex-shrink: 0;
        }

        .codeskill-custom-footer .dept-cursor {
          display: inline-block;
          width: 2px;
          height: 1.15em;
          background-color: currentColor;
          margin-left: 3px;
          vertical-align: middle;
          border-radius: 1px;
          animation: cursorBlink 0.8s infinite;
        }

        @keyframes cursorBlink {
          0%, 45% { opacity: 1; }
          50%, 95% { opacity: 0; }
          100% { opacity: 1; }
        }

        .codeskill-custom-footer .desc {
          font-size: 1.05rem;
          line-height: 1.7;
          color: var(--muted);
          max-width: 520px;
          margin-bottom: 1.6rem;
        }

        .codeskill-custom-footer .verify {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          font-size: 0.9rem;
          color: var(--muted);
          background: #fff;
          border: 1px solid var(--line);
          padding: 0.7rem 1rem;
          border-radius: 10px;
        }

        :global(.dark) .codeskill-custom-footer .verify {
          background: rgba(255, 255, 255, 0.04);
        }

        .codeskill-custom-footer .verify .pulse {
          position: relative;
          display: grid;
          place-items: center;
          color: #10b981;
          font-size: 18px;
        }

        .codeskill-custom-footer .verify .pulse::before {
          content: "";
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          background: #10b981;
          opacity: 0.35;
          animation: pulse 2s ease-out infinite;
        }

        @keyframes pulse {
          0% { transform: scale(0.6); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        .codeskill-custom-footer h4 {
          font-size: 0.92rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 1.5rem;
          white-space: nowrap;
          color: var(--ink);
        }

        .codeskill-custom-footer ul {
          list-style: none;
          display: grid;
          gap: 1rem;
          margin: 0;
          padding: 0;
        }

        .codeskill-custom-footer ul a {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: var(--muted);
          text-decoration: none;
          font-size: 1rem;
          transition: color 0.3s, transform 0.3s var(--ease);
        }

        .codeskill-custom-footer ul a::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: -4px;
          height: 1.5px;
          width: 100%;
          transform: scaleX(0);
          transform-origin: right;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
          transition: transform 0.4s var(--ease);
        }

        .codeskill-custom-footer ul a:hover {
          color: var(--ink);
          transform: translateX(6px);
        }

        .codeskill-custom-footer ul a:hover::after {
          transform: scaleX(1);
          transform-origin: left;
        }

        .codeskill-custom-footer ul a svg {
          font-size: 19px;
          transition: transform 0.3s var(--ease), color 0.3s;
        }

        .codeskill-custom-footer .social a:hover svg {
          color: var(--accent);
          transform: scale(1.2) rotate(-6deg);
        }

        .codeskill-custom-footer .legal-notice {
          border-top: 1px solid var(--line);
          margin-top: 2.5rem;
          padding-top: 1.5rem;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          font-family: monospace;
          font-size: 0.78rem;
          color: var(--muted);
        }

        /* ---------- GIANT TYPOGRAPHY (FULL SCREEN EDGE TO EDGE) ---------- */
        .codeskill-custom-footer .giant {
          --crop: 0.96;
          position: relative;
          display: flex;
          justify-content: center;
          margin: 2.5rem calc(var(--pad) * -1) 0;
          width: calc(100% + (var(--pad) * 2));
          max-width: 100vw;
          overflow: hidden;
          height: calc(var(--fs, 200px) * var(--crop));
          user-select: none;
          box-sizing: border-box;
          padding-bottom: 0.75rem;
        }

        .codeskill-custom-footer .giant .txt {
          display: flex;
          flex: none;
          width: max-content;
          white-space: nowrap;
          font-size: var(--fs, 200px);
          font-weight: 800;
          line-height: 1.0;
          letter-spacing: -0.045em;
          color: #0f0f10;
        }

        :global(.dark) .codeskill-custom-footer .giant .txt {
          color: #ffffff;
        }

        .codeskill-custom-footer .giant .txt span {
          display: inline-block;
          transform: translateY(105%);
          transition: transform 1.1s var(--ease), color 0.4s;
          transition-delay: calc(var(--i) * 70ms);
        }

        .codeskill-custom-footer.in .giant .txt span,
        .codeskill-custom-footer .giant.in .txt span {
          transform: none;
        }

        .codeskill-custom-footer .giant.in .txt span:hover,
        .codeskill-custom-footer.in .giant .txt span:hover {
          transform: translateY(-5%);
          transition-delay: 0ms;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .codeskill-custom-footer .giant::after {
          display: none;
        }

        /* Circular Progress Back-to-Top Button */
        .top {
          position: fixed;
          right: 24px;
          bottom: 24px;
          width: 52px;
          height: 52px;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          background: #0b0f1a;
          color: #fff;
          display: grid;
          place-items: center;
          z-index: 90;
          opacity: 0;
          transform: translateY(20px) scale(0.8);
          pointer-events: none;
          transition: all 0.5s var(--ease);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }

        .top.show {
          opacity: 1;
          transform: none;
          pointer-events: auto;
        }

        .top svg.ring {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .top svg.ring circle {
          fill: none;
          stroke-width: 2.5;
        }

        .top .track {
          stroke: rgba(255, 255, 255, 0.15);
        }

        .top .bar {
          stroke: url(#g);
          stroke-linecap: round;
          stroke-dasharray: 138.2;
          stroke-dashoffset: 138.2;
          transition: stroke-dashoffset 0.15s ease-out;
        }

        @media (max-width: 1280px) {
          .codeskill-custom-footer .grid {
            grid-template-columns: minmax(460px, 2.4fr) repeat(4, 1fr);
            gap: 1.6rem;
          }
          .codeskill-custom-footer .cu-logo-img { height: 66px; }
          .codeskill-custom-footer .codeskill-logo-img { height: 64px; }
          .codeskill-custom-footer .brand-divider { height: 46px; }
        }

        @media (max-width: 1000px) {
          :root { --pad: 1.5rem; }
          .codeskill-custom-footer {
            --pad: 1.5rem;
            padding-top: 3rem;
          }
          .codeskill-custom-footer .grid {
            grid-template-columns: 1fr 1fr;
            gap: 2.2rem;
          }
          .codeskill-custom-footer .grid > div:first-child {
            grid-column: 1 / -1;
          }
          .codeskill-custom-footer .cu-logo-img { height: 60px; }
          .codeskill-custom-footer .codeskill-logo-img { height: 56px; }
          .codeskill-custom-footer .brand-divider { height: 42px; }
        }

        @media (max-width: 768px) {
          :root { --pad: 1.25rem; }
          .codeskill-custom-footer {
            --pad: 1.25rem;
            padding-top: 2.5rem;
            border-radius: 30px 30px 0 0;
            margin-top: 2.75rem;
          }
          .codeskill-custom-footer .grid {
            grid-template-columns: 1fr 1fr;
            gap: 2rem 1.25rem;
          }
          .codeskill-custom-footer .cu-logo-img { height: 48px; max-width: 160px; }
          .codeskill-custom-footer .codeskill-logo-img { height: 44px; max-width: 140px; }
          .codeskill-custom-footer .brand-divider { height: 34px; }
          .codeskill-custom-footer .brand-row { gap: 0.85rem; }
          .codeskill-custom-footer .dept { font-size: 0.95rem; margin: 0.65rem 0 1rem; }
          .codeskill-custom-footer .desc { font-size: 0.92rem; line-height: 1.6; margin-bottom: 1.25rem; }
          .codeskill-custom-footer h4 {
            font-size: 0.82rem;
            margin-bottom: 0.9rem;
          }
          .codeskill-custom-footer ul {
            gap: 0.7rem;
          }
          .codeskill-custom-footer ul a {
            font-size: 0.9rem;
          }
          .top {
            width: 46px;
            height: 46px;
            right: 18px;
            bottom: 18px;
          }
        }

        @media (max-width: 520px) {
          :root { --pad: 1rem; }
          .codeskill-custom-footer {
            --pad: 1rem;
            padding-top: 2rem;
            border-radius: 24px 24px 0 0;
            margin-top: 2rem;
          }
          .codeskill-custom-footer .brand-row {
            display: flex;
            align-items: center;
            gap: 0.65rem;
            flex-wrap: wrap;
          }
          .codeskill-custom-footer .cu-logo-img {
            height: 38px;
            max-width: 135px;
          }
          .codeskill-custom-footer .codeskill-logo-img {
            height: 36px;
            max-width: 120px;
          }
          .codeskill-custom-footer .brand-divider {
            height: 26px;
            margin: 0 0.1rem;
          }
          .codeskill-custom-footer .dept {
            font-size: 0.84rem;
            margin: 0.5rem 0 0.8rem;
            min-height: auto;
            flex-wrap: wrap;
          }
          .codeskill-custom-footer .desc {
            font-size: 0.84rem;
            line-height: 1.55;
            margin-bottom: 1rem;
          }
          .codeskill-custom-footer .verify {
            width: 100%;
            box-sizing: border-box;
            font-size: 0.76rem;
            padding: 0.55rem 0.75rem;
            gap: 0.5rem;
            border-radius: 8px;
          }
          .codeskill-custom-footer .grid {
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem 0.85rem;
          }
          .codeskill-custom-footer h4 {
            font-size: 0.75rem;
            letter-spacing: 0.04em;
            margin-bottom: 0.7rem;
            white-space: normal;
          }
          .codeskill-custom-footer ul {
            gap: 0.55rem;
          }
          .codeskill-custom-footer ul a {
            font-size: 0.82rem;
            gap: 0.4rem;
          }
          .codeskill-custom-footer ul a:hover {
            transform: translateX(3px);
          }
          .codeskill-custom-footer .legal-notice {
            flex-direction: column;
            text-align: center;
            gap: 0.45rem;
            margin-top: 1.4rem;
            padding-top: 1rem;
            font-size: 0.72rem;
          }
          .codeskill-custom-footer .giant {
            --crop: 0.95;
            margin-top: 1.25rem;
          }
          .top {
            width: 40px;
            height: 40px;
            right: 12px;
            bottom: 12px;
          }
        }

        @media (max-width: 360px) {
          :root { --pad: 0.75rem; }
          .codeskill-custom-footer {
            --pad: 0.75rem;
            padding-top: 1.75rem;
          }
          .codeskill-custom-footer .brand-row {
            gap: 0.5rem;
          }
          .codeskill-custom-footer .cu-logo-img {
            height: 34px;
            max-width: 120px;
          }
          .codeskill-custom-footer .codeskill-logo-img {
            height: 32px;
            max-width: 110px;
          }
          .codeskill-custom-footer .brand-divider {
            height: 22px;
          }
          .codeskill-custom-footer .grid {
            grid-template-columns: 1fr 1fr;
            gap: 1.3rem 0.5rem;
          }
          .codeskill-custom-footer h4 {
            font-size: 0.7rem;
          }
          .codeskill-custom-footer ul a {
            font-size: 0.76rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .codeskill-custom-footer .giant .txt span {
            transition: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
          .codeskill-custom-footer .edge {
            width: 70% !important;
            transition: none !important;
          }
          .codeskill-custom-footer .dept-cursor {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

export default CodeSkillFooterAnimation;
