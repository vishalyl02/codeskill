import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const roboto = localFont({
  src: [
    { path: "../../public/fonts/NimbusSanL-Reg.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/NimbusSanL-Bol.otf", weight: "700", style: "normal" },
    { path: "../../public/fonts/NimbusSanL-RegIta.otf", weight: "400", style: "italic" },
    { path: "../../public/fonts/NimbusSanL-BolIta.otf", weight: "700", style: "italic" },
  ],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "CodeSkill — Algorithmic Assessment & Skill System",
  description:
    "Practice DSA, solve coding problems, take proctored assessments, and prepare for technical interviews with CodeSkill.",
  keywords: [
    "CodeSkill",
    "DSA practice",
    "algorithmic assessment",
    "proctored coding exams",
    "technical interview preparation",
    "Chandigarh University",
    "online judge",
    "coding evaluation",
  ],
  openGraph: {
    title: "CodeSkill — Algorithmic Assessment & Skill System",
    description:
      "Practice DSA, solve coding problems, take proctored assessments, and prepare for technical interviews with CodeSkill.",
    type: "website",
    siteName: "CodeSkill",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

import { Background } from "@/components/Background";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Providers } from "@/components/Providers";

const antiFlashScript = `
  (function() {
    try {
      var stored = localStorage.getItem('codeskill_theme');
      var isDark = stored === 'dark' || ((!stored || stored === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(isDark ? 'dark' : 'light');
      root.style.colorScheme = isDark ? 'dark' : 'light';
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          id="codeskill-theme-init"
          dangerouslySetInnerHTML={{ __html: antiFlashScript }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans bg-background text-foreground transition-colors duration-200">
        <Providers>
          <Background />
          <Navbar />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
