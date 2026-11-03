"use client";

import React, { useState, useEffect } from "react";
import { Download, FileText, X } from "lucide-react";
import { AssessmentReportData } from "./types";
import { AssessmentReportPDF } from "./AssessmentReportPDF";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  data: AssessmentReportData;
}

export const PDFDownloadButton = ({ data }: Props) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentName = (data?.student?.name || "candidate")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
  const reportId = data?.reportId || "report";
  const fileName = `codeskill-assessment-${studentName}-${reportId}.pdf`;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const generateBlobUrl = async (): Promise<string> => {
    if (previewUrl) return previewUrl;
    const { pdf } = await import("@react-pdf/renderer");
    const blob = await pdf(<AssessmentReportPDF data={data} />).toBlob();
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return url;
  };

  const handleOpenPreview = async () => {
    setShowPreview(true);
    if (previewUrl) return;
    setIsGenerating(true);
    setError(null);
    try {
      await generateBlobUrl();
    } catch (err: any) {
      console.error("Failed to generate PDF preview:", err);
      setError("Failed to render PDF preview. You can still download the report directly.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const url = await generateBlobUrl();
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("Failed to generate PDF for download:", err);
      setError("Failed to download PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 print-hidden">
        <button
          type="button"
          onClick={handleOpenPreview}
          className="flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <FileText className="w-4 h-4 text-primary" /> Preview PDF
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Spinner className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download PDF Report</span>
            </>
          )}
        </button>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm p-4 md:p-8">
          <div className="flex items-center justify-between mb-4 bg-card p-4 rounded-xl border border-border shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-foreground">Preview: {fileName}</h2>
              <p className="text-sm text-muted-foreground">Official Candidate Assessment Report</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isGenerating}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isGenerating ? "Generating..." : "Download"}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Close preview"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-muted/30 rounded-xl overflow-hidden border border-border shadow-inner relative flex items-center justify-center">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
                <Spinner className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating official assessment report preview...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                >
                  Retry Preview
                </button>
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full min-h-[650px] border-none rounded-xl"
                title={`Preview - ${fileName}`}
              />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};
