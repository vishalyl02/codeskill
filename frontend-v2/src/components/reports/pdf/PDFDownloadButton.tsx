"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, FileText, X } from 'lucide-react';
import { AssessmentReportData } from './types';
import { AssessmentReportPDF } from './AssessmentReportPDF';

// Dynamically import PDF features via our local wrapper to avoid Next.js ESM dynamic import bugs
const PDFDownloadLink = dynamic(
  () => import('./PDFComponents').then(mod => mod.PDFDownloadLink),
  { ssr: false }
);

const PDFViewer = dynamic(
  () => import('./PDFComponents').then(mod => mod.PDFViewer),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading PDF Viewer...</div> }
);

interface Props {
  data: AssessmentReportData;
}

export const PDFDownloadButton = ({ data }: Props) => {
  const [showPreview, setShowPreview] = useState(false);

  const fileName = `codeskill-assessment-${data.student.name.replace(/\s+/g, '-').toLowerCase()}-${data.reportId}.pdf`;

  return (
    <>
      <div className="flex items-center gap-2 print-hidden">
        <button
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <FileText className="w-4 h-4" /> Preview PDF
        </button>

        <PDFDownloadLink
          document={<AssessmentReportPDF data={data} />}
          fileName={fileName}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {({ loading, error }) => (
            <>
              <Download className="w-4 h-4" />
              {loading ? 'Generating PDF...' : error ? 'Error Generating PDF' : 'Download PDF Report'}
            </>
          )}
        </PDFDownloadLink>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm p-4 md:p-8">
          <div className="flex items-center justify-between mb-4 bg-card p-4 rounded-xl border border-border shadow-sm">
            <div>
              <h2 className="text-xl font-bold">Preview: {fileName}</h2>
              <p className="text-sm text-muted-foreground">Professional Assessment Report</p>
            </div>
            <div className="flex items-center gap-4">
              <PDFDownloadLink
                document={<AssessmentReportPDF data={data} />}
                fileName={fileName}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {({ loading }) => (
                  <>
                    <Download className="w-4 h-4" />
                    {loading ? 'Generating...' : 'Download'}
                  </>
                )}
              </PDFDownloadLink>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="flex-1 bg-muted rounded-xl overflow-hidden border border-border shadow-inner">
            <PDFViewer className="w-full h-full border-none" showToolbar={true}>
              <AssessmentReportPDF data={data} />
            </PDFViewer>
          </div>
        </div>
      )}
    </>
  );
};
