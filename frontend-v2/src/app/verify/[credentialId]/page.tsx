"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  XCircle,
  Award,
  CheckCircle2,
  Calendar,
  Building,
  GraduationCap,
  Sparkles,
  ExternalLink,
  Printer,
  Download,
  Share2,
  Copy,
  Check,
  ArrowLeft,
  X,
  Info,
  Loader2,
} from "lucide-react";
import { certificateVerificationAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  ChandigarhUniversityCertificate,
  CertificateData,
} from "@/components/learning/ChandigarhUniversityCertificate";

interface VerificationResult extends CertificateData {
  valid: boolean;
  status?: string;
  error?: string;
}

export default function PublicCertificateVerificationPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
  const { credentialId } = use(params);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [copiedPostText, setCopiedPostText] = useState(false);

  useEffect(() => {
    verify();
  }, [credentialId]);

  const verify = async () => {
    try {
      setLoading(true);
      const res = await certificateVerificationAPI.verify(credentialId);
      setResult(res.data);
    } catch (err) {
      setResult({
        valid: false,
        credentialId,
        recipientName: "",
        learningPath: "",
        error: "Unable to verify credential against the official registry",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyField = (fieldName: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePrint = () => {
    document.body.classList.add("certificate-print-mode");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("certificate-print-mode");
    }, 1500);
  };

  const handleDownloadImage = async () => {
    try {
      setDownloading(true);
      const element = document.getElementById("printable-university-certificate");
      if (!element) {
        handlePrint();
        return;
      }

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(element, {
        scale: 3, // 300 DPI high-definition resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#fdfcf9",
        logging: false,
      });

      const dataUrl = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      const safeRecipient = (result?.recipientName || "Student")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `Chandigarh_University_Certificate_${safeRecipient}_${credentialId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Direct download failed, falling back to print dialog", err);
      handlePrint();
    } finally {
      setDownloading(false);
    }
  };

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const certName = result?.learningPath || "Data Structures & Algorithms in Practice";
  const orgName = "Chandigarh University";
  const issueDate = result?.issuedAt ? new Date(result.issuedAt) : new Date();
  const issueYear = issueDate.getFullYear();
  const issueMonth = issueDate.getMonth() + 1;

  const linkedInAddUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    certName
  )}&organizationName=${encodeURIComponent(
    orgName
  )}&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${encodeURIComponent(
    currentUrl
  )}&certId=${encodeURIComponent(result?.credentialId || credentialId)}`;

  const linkedInPostText = `🎓 Proud to share that I have earned the Certificate of Excellence in ${certName} from Chandigarh University via CodeSkill! 🚀\n\nVerified Credential ID: ${credentialId}\nCheck authenticity record: ${currentUrl}\n\n#ChandigarhUniversity #CodeSkill #DSA #ContinuousLearning #EngineeringExcellence`;

  const handleOpenLinkedInPost = () => {
    navigator.clipboard.writeText(linkedInPostText);
    setCopiedPostText(true);
    setTimeout(() => setCopiedPostText(false), 3000);
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      currentUrl
    )}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=650,height=600");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors">
      {/* Top Banner / Verification Header (Hidden on Print) */}
      <header className="print:hidden border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-2.5 sm:px-6 flex items-center justify-between">
          <Link
            href="/learning"
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>CodeSkill Learning Catalog</span>
          </Link>

          <div className="flex items-center gap-2">
            <img
              src="/cu-logo.png"
              alt="Chandigarh University"
              className="w-7 h-7 object-contain"
            />
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Official University Ledger</span>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4 print:p-0 print:m-0 print:max-w-none print:w-full print:space-y-0">
        {/* Verification Status Overview Banner (Hidden on Print) */}
        <div className="print:hidden text-center max-w-2xl mx-auto space-y-2 pt-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-muted text-foreground border border-border">
            <GraduationCap className="w-3.5 h-3.5 text-primary" />
            <span>Chandigarh University · Verifiable Digital Credential</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            Certificate Authenticity Record
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Verification ID:{" "}
            <span className="font-mono text-foreground font-bold bg-muted px-2 py-0.5 rounded">
              {credentialId}
            </span>{" "}
            · Issued under the academic auspices of Chandigarh University
          </p>
        </div>

        {/* Action Toolbar (Hidden on Print) */}
        {result?.valid && (
          <div className="print:hidden flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 py-1">
            <Button
              onClick={handlePrint}
              variant="default"
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground font-semibold shadow-sm text-xs h-8 cursor-pointer"
              title="Print certificate or save as PDF via your browser's print dialog"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </Button>

            <Button
              onClick={handleDownloadImage}
              disabled={downloading}
              variant="secondary"
              size="sm"
              className="gap-1.5 border border-border bg-card text-foreground hover:bg-muted font-semibold shadow-sm text-xs h-8 cursor-pointer"
              title="Download high-resolution 300 DPI certificate image directly"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>Generating Certificate...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Download Certificate</span>
                </>
              )}
            </Button>

            <Button
              onClick={() => setShowLinkedInModal(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 border-border bg-card text-foreground hover:bg-muted font-semibold shadow-sm text-xs h-8 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-[#0A66C2]" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
              </svg>
              <span>Add to LinkedIn</span>
            </Button>

            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="sm"
              className="gap-1.5 border-border bg-card text-foreground hover:bg-muted font-semibold shadow-sm text-xs h-8 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Link Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Copy Verification URL</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Certificate Display Area */}
        {result?.valid ? (
          <div className="py-1 print:p-0 print:m-0">
            <ChandigarhUniversityCertificate data={result} />
          </div>
        ) : (
          <div className="max-w-md mx-auto rounded-2xl bg-card border border-rose-500/40 p-8 text-center shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mx-auto mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Unverified or Invalid Credential
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              The credential ID{" "}
              <span className="font-mono text-foreground font-semibold">
                {credentialId}
              </span>{" "}
              could not be validated in the official Chandigarh University digital registry.
            </p>
            <div className="mt-6">
              <Link
                href="/learning"
                className="inline-flex items-center gap-1.5 text-xs text-primary font-bold hover:underline"
              >
                <span>Return to Learning Catalog</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Metadata Card Below Certificate (Hidden on Print) */}
        {result?.valid && (
          <div className="print:hidden max-w-[820px] mx-auto bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-bold text-foreground">
                  Official Verification & Issuance Audit
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                STATUS: VALID & ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-muted-foreground font-medium block text-[10px]">
                  Issuing Institution
                </span>
                <span className="text-foreground font-semibold">
                  {result.institution || "Chandigarh University"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground font-medium block text-[10px]">
                  Accreditation
                </span>
                <span className="text-foreground font-semibold">
                  {result.accreditation || "NAAC A+ Accredited"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground font-medium block text-[10px]">
                  Issuance Date
                </span>
                <span className="text-foreground font-semibold">
                  {result.issuedAt
                    ? new Date(result.issuedAt).toLocaleDateString()
                    : "Official"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground font-medium block text-[10px]">
                  Record Ledger
                </span>
                <span className="text-foreground font-semibold">
                  Cryptographically Anchored
                </span>
              </div>
            </div>

            {/* Official University Institutional Authorities */}
            <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <img
                  src="/satbir-singh-sehgal.png"
                  alt="Prof. (Dr.) Satbir Singh Sehgal"
                  className="w-8 h-8 rounded-full border border-amber-500/60 object-cover shadow-2xs"
                />
                <div>
                  <div className="font-bold text-foreground text-[11px] leading-tight">
                    Prof. (Dr.) Satbir Singh Sehgal
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    Vice-Chancellor · E18146 · vc@cumail.in
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <img
                  src="/ishdeep-singla.png"
                  alt="Ishdeep Singla"
                  className="w-8 h-8 rounded-full border border-amber-500/60 object-cover shadow-2xs"
                />
                <div>
                  <div className="font-bold text-foreground text-[11px] leading-tight">
                    Ishdeep Singla
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    Head - Technical Training (CSE) · E16430 · ad.skill@cumail.in
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer (Hidden on Print) */}
      <footer className="print:hidden border-t border-border py-4 text-center text-xs text-muted-foreground">
        <p>
          © {new Date().getFullYear()} Chandigarh University · Department of Computer Science & Engineering. All rights reserved.
        </p>
      </footer>

      {/* LinkedIn Integration & Sharing Assistant Modal */}
      {showLinkedInModal && result?.valid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0A66C2]/10 border border-[#0A66C2]/30 flex items-center justify-center text-[#0A66C2]">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    LinkedIn Certificate Integration
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Add to profile licenses or share announcement post
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowLinkedInModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action 1: Add to LinkedIn Profile Licenses & Certifications */}
            <div className="space-y-3 bg-muted/30 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    <span>Option 1: Add to Licenses & Certifications</span>
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Features this credential permanently on your LinkedIn profile.
                  </p>
                </div>

                <a
                  href={linkedInAddUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <span>Add to Profile</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Pre-filled fields with 1-click copy helpers */}
              <div className="space-y-1.5 pt-2 border-t border-border/60 text-[11px]">
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-muted-foreground">Certification:</span>
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <span className="truncate max-w-[200px]">{certName}</span>
                    <button
                      onClick={() => handleCopyField("name", certName)}
                      className="text-primary hover:underline text-[10px]"
                    >
                      {copiedField === "name" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-0.5">
                  <span className="text-muted-foreground">Issuing Org:</span>
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <span>{orgName}</span>
                    <button
                      onClick={() => handleCopyField("org", orgName)}
                      className="text-primary hover:underline text-[10px]"
                    >
                      {copiedField === "org" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-0.5">
                  <span className="text-muted-foreground">Credential ID:</span>
                  <div className="flex items-center gap-1.5 font-mono font-medium text-foreground">
                    <span>{credentialId}</span>
                    <button
                      onClick={() => handleCopyField("id", credentialId)}
                      className="text-primary hover:underline text-[10px]"
                    >
                      {copiedField === "id" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action 2: Share Post on LinkedIn Feed */}
            <div className="space-y-3 bg-muted/30 border border-border rounded-xl p-4">
              <div>
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-primary" />
                  <span>Option 2: Share Announcement on LinkedIn Feed</span>
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Copy pre-crafted announcement text and open the post composer.
                </p>
              </div>

              {/* Pre-crafted post preview box */}
              <div className="p-2.5 rounded-lg bg-background border border-border text-[11px] text-muted-foreground font-sans whitespace-pre-line leading-relaxed max-h-24 overflow-y-auto">
                {linkedInPostText}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={handleOpenLinkedInPost}
                  size="sm"
                  className="flex-1 gap-1.5 bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white text-xs font-semibold h-8"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Copy Text & Open LinkedIn</span>
                </Button>

                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(linkedInPostText);
                    setCopiedPostText(true);
                    setTimeout(() => setCopiedPostText(false), 2500);
                  }}
                  variant="outline"
                  size="sm"
                  className="gap-1 border-border text-foreground hover:bg-muted text-xs h-8"
                >
                  {copiedPostText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Copy Text</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Localhost Preview Note */}
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-lg border border-border">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Note on localhost preview:</strong> LinkedIn servers cannot fetch preview images from <code>localhost:3000</code>. Simply paste the copied announcement text into your post. On production domains, LinkedIn automatically shows rich preview cards.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
