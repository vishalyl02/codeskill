"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Award,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Calendar,
  Sparkles,
} from "lucide-react";
import { learningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface CertificateItem {
  id: string;
  credentialId: string;
  recipientName: string;
  pathTitle: string;
  verificationUrl: string;
  issuedAt: string;
  status: string;
  metadata: {
    totalHours?: number;
    courseCount?: number;
    score?: number;
  };
}

export default function MyCertificatesPage() {
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      setLoading(true);
      const res = await learningAPI.getMyCertificates();
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      setCertificates(list);
    } catch (err) {
      console.error("Failed to load certificates", err);
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = (credId: string) => {
    const url = `${window.location.origin}/verify/${credId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(credId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-20 px-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <div>
          <Link
            href="/learning"
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Learning Catalog</span>
          </Link>
        </div>

        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verifiable Digital Credentials</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                My Earned Certificates
              </h1>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
                Cryptographically verifiable certificates of completion issued by the CodeSkill technical training authority.
              </p>
            </div>

            <div className="flex items-center gap-3 bg-muted/40 border border-border px-5 py-3 rounded-xl shadow-inner">
              <Award className="w-7 h-7 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground font-medium">Total Credentials</div>
                <div className="text-xl font-bold text-foreground">
                  {certificates.length} Verified
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Certificates Showcase */}
        {certificates.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-xl border border-border p-8 shadow-sm">
            <Award className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">No Certificates Earned Yet</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
              Enroll in a learning path, pass all mandatory practice exercises with 70%+ score, and claim your verified digital credential.
            </p>
            <Link
              href="/learning"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold transition-all shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              <span>Browse Learning Paths</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="bg-card border border-border rounded-xl p-6 hover:border-foreground/20 hover:shadow-md transition-all shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-muted text-foreground border border-border">
                      {cert.credentialId}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Valid</span>
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-1">
                    {cert.pathTitle}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Issued to <span className="font-semibold text-foreground">{cert.recipientName}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border text-xs mb-4">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Issued Date</span>
                      <span className="font-semibold text-foreground">
                        {new Date(cert.issuedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Curriculum</span>
                      <span className="font-semibold text-foreground">
                        {cert.metadata?.courseCount || 1} Courses Verified
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/verify/${cert.credentialId}`}
                      target="_blank"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors shadow-sm"
                    >
                      <span>View Official Certificate</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(cert.credentialId)}
                      className="h-8 px-3 gap-1.5 border-border text-foreground hover:bg-muted text-xs"
                      title="Copy verification link"
                    >
                      {copiedId === cert.credentialId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/verify/${cert.credentialId}`;
                        const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
                        window.open(shareUrl, "_blank", "noopener,noreferrer,width=650,height=600");
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border border-border bg-card hover:bg-muted text-[11px] font-semibold text-foreground transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 fill-[#0A66C2]" viewBox="0 0 24 24">
                        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
                      </svg>
                      <span>Share on LinkedIn</span>
                    </button>

                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/verify/${cert.credentialId}`;
                        const issueDate = new Date(cert.issuedAt);
                        const issueYear = issueDate.getFullYear();
                        const issueMonth = issueDate.getMonth() + 1;
                        const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
                          cert.pathTitle
                        )}&organizationName=${encodeURIComponent(
                          "Chandigarh University"
                        )}&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${encodeURIComponent(
                          url
                        )}&certId=${encodeURIComponent(cert.credentialId)}`;
                        window.open(linkedInUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border border-border bg-card hover:bg-muted text-[11px] font-semibold text-foreground transition-colors"
                    >
                      <Award className="w-3.5 h-3.5 text-amber-500" />
                      <span>Add to LinkedIn</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
