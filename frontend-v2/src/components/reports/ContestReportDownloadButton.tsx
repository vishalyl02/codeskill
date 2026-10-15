"use client";

import React, { useState, useEffect } from "react";
import { Download, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { ContestReportData } from "@/types/contest-report";
import { Spinner } from "@/components/ui/spinner";

interface ContestReportDownloadButtonProps {
  data: ContestReportData;
  logoPath?: string;
  filename?: string;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
}

export function ContestReportDownloadButton({
  data,
  logoPath,
  filename,
  className = "",
  variant = "primary",
  size = "md",
}: ContestReportDownloadButtonProps) {
  const [isClient, setIsClient] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const reportFilename =
    filename ||
    `CodeSkill-Contest-Report-${data.student.uid}-${data.contest.id || "2026"}.pdf`;

  const handleDownload = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMessage(null);
    setDownloadSuccess(false);

    try {
      // Dynamically import @react-pdf/renderer to ensure client-only execution
      const { pdf } = await import("@react-pdf/renderer");
      const { ContestReportDocument } = await import("./ContestReportDocument");
      let logoSrc: string | undefined;
      if (logoPath) {
        const response = await fetch(logoPath);
        if (!response.ok) throw new Error("Could not load the university logo.");
        const logoBlob = await response.blob();
        logoSrc = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the university logo."));
          reader.onerror = () => reject(reader.error || new Error("Could not read the university logo."));
          reader.readAsDataURL(logoBlob);
        });
      }

      const blob = await pdf(<ContestReportDocument data={data} logoSrc={logoSrc} />).toBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = reportFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3500);
    } catch (err: any) {
      console.error("Failed to generate contest report PDF:", err);
      setErrorMessage("Failed to generate PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

  const sizeStyles = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-9 px-4 text-xs sm:text-[13px] gap-2",
    lg: "h-11 px-6 text-sm font-semibold gap-2.5",
  }[size];

  const variantStyles = {
    primary:
      "bg-white hover:bg-neutral-100 text-black font-bold shadow-xs hover:shadow-md border border-white/20",
    secondary:
      "bg-neutral-900 hover:bg-neutral-800 text-white border border-white/10 hover:border-white/20",
    outline:
      "bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground border border-border",
  }[variant];

  if (!isClient) {
    return (
      <button
        disabled
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      >
        <FileText className="w-3.5 h-3.5" />
        <span>Download Report</span>
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleDownload}
        disabled={isGenerating}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        title="Download official A4 performance scorecard"
      >
        {isGenerating ? (
          <>
            <Spinner className="w-3.5 h-3.5 animate-spin" />
            <span>Generating A4 PDF...</span>
          </>
        ) : downloadSuccess ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Report Downloaded</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Download Official PDF Report</span>
          </>
        )}
      </button>

      {errorMessage && (
        <span className="text-[11px] text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {errorMessage}
        </span>
      )}
    </div>
  );
}

export default ContestReportDownloadButton;
