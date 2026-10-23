"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, Award } from "lucide-react";

export interface CertificateData {
  credentialId: string;
  recipientName: string;
  learningPath: string;
  issuedAt?: string;
  issuer?: string;
  institution?: string;
  department?: string;
  accreditation?: string;
  grade?: string;
  skills?: string[];
  estimatedHours?: number;
  verificationUrl?: string;
}

interface ChandigarhUniversityCertificateProps {
  data: CertificateData;
  className?: string;
}

export function ChandigarhUniversityCertificate({
  data,
  className = "",
}: ChandigarhUniversityCertificateProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  const verificationUrl =
    data.verificationUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/verify/${data.credentialId}`
      : `https://codeskill.chandigarhuniversity.ac.in/verify/${data.credentialId}`);

  useEffect(() => {
    if (data.credentialId) {
      QRCode.toDataURL(verificationUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: "#1e1b4b",
          light: "#ffffff",
        },
      })
        .then(setQrCodeUrl)
        .catch((err) => {
          console.error("Failed to generate QR code", err);
        });
    }
  }, [data.credentialId, verificationUrl]);

  const formattedDate = data.issuedAt
    ? new Date(data.issuedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  return (
    <>
      {/* Print Specific CSS to guarantee single-page, full-bleed A4 landscape output */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0mm;
          }
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-university-certificate,
          #printable-university-certificate * {
            visibility: visible !important;
          }
          #printable-university-certificate {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            min-width: 297mm !important;
            min-height: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            z-index: 9999999 !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            page-break-inside: avoid !important;
            background: #fdfcf9 !important;
          }
        }
      `}</style>

      {/* Main Certificate Canvas: Standard A4 Landscape Proportions (297mm x 210mm) */}
      <div
        id="printable-university-certificate"
        className={`print-certificate-container relative w-full max-w-[940px] mx-auto aspect-[1.414/1] bg-[#fdfcf9] text-slate-900 shadow-2xl rounded-sm overflow-hidden select-none font-serif flex flex-col justify-between ${className}`}
        style={{
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(180, 83, 9, 0.3)",
        }}
      >
        {/* Outer Official Academic Border (Rich University Maroon & Double Gold Inset) */}
        <div className="w-full h-full p-3 sm:p-4 md:p-5 border-[7px] sm:border-[9px] border-[#7f1d1d] relative bg-[#fdfcf9] flex flex-col justify-between">
          {/* Inner Filigree Gold Line with Classic Corner Notches */}
          <div className="relative w-full h-full border-2 border-[#b45309] p-4 sm:p-6 md:p-7 bg-[#fffefc] flex flex-col justify-between">
            {/* Corner Ornamental Accents */}
            <div className="absolute top-1 left-1 w-6 h-6 border-t-2 border-l-2 border-[#b45309]" />
            <div className="absolute top-1 right-1 w-6 h-6 border-t-2 border-r-2 border-[#b45309]" />
            <div className="absolute bottom-1 left-1 w-6 h-6 border-b-2 border-l-2 border-[#b45309]" />
            <div className="absolute bottom-1 right-1 w-6 h-6 border-b-2 border-r-2 border-[#b45309]" />

            {/* Subtle Authentic Security Watermark */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none select-none overflow-hidden">
              <img
                src="/cu-logo.png"
                alt=""
                className="w-[380px] h-[380px] object-contain"
              />
            </div>

            {/* TOP HEADER: University Identity & Accreditation */}
            <div className="relative z-10 flex flex-col items-center text-center">
              {/* Registration & Accreditation Top Strip */}
              <div className="w-full flex items-center justify-between pb-1 border-b border-amber-600/30 text-[8.5px] sm:text-[9.5px] font-sans font-bold text-amber-900 uppercase tracking-widest">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  NAAC Grade A+ Accredited University
                </span>
                <span className="hidden sm:inline text-amber-800/80 font-mono">
                  REG: CU/CSE/CERT/{data.credentialId.slice(0, 10).toUpperCase()}
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 inline" />
                  UGC Recognized · Punjab
                </span>
              </div>

              {/* Official University Emblem & Header Typography */}
              <div className="pt-2 flex items-center justify-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full bg-white border border-amber-500/60 p-0.5 shadow-xs flex items-center justify-center">
                  <img
                    src="/cu-logo.png"
                    alt="Chandigarh University"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="text-center sm:text-left">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-serif font-black tracking-widest text-[#7f1d1d] uppercase leading-tight">
                    CHANDIGARH UNIVERSITY
                  </h1>
                  <p className="text-[9.5px] sm:text-[10.5px] font-sans font-semibold tracking-wider text-amber-900 uppercase">
                    Department of Computer Science & Engineering · Apex Institute of Technology
                  </p>
                </div>
              </div>
            </div>

            {/* DIPLOMA TITLE & RECIPIENT BODY */}
            <div className="relative z-10 text-center my-auto py-1 space-y-1.5 sm:space-y-2">
              {/* Title Ribbon */}
              <div className="inline-flex items-center gap-3">
                <span className="h-[1.5px] w-8 sm:w-16 bg-gradient-to-r from-transparent via-[#b45309] to-[#7f1d1d]" />
                <h2 className="text-xs sm:text-sm md:text-base font-serif font-extrabold uppercase tracking-[0.25em] text-slate-800">
                  Certificate of Excellence
                </h2>
                <span className="h-[1.5px] w-8 sm:w-16 bg-gradient-to-l from-transparent via-[#b45309] to-[#7f1d1d]" />
              </div>

              <p className="text-xs sm:text-sm italic font-serif text-slate-600">
                This credential of academic achievement is conferred upon
              </p>

              {/* Recipient Full Name */}
              <div className="py-1">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-serif font-black tracking-wide text-[#7f1d1d] capitalize drop-shadow-2xs">
                  {data.recipientName || "Mustakim Shaikh"}
                </h3>
                <div className="w-28 sm:w-36 h-[1.5px] bg-gradient-to-r from-transparent via-amber-600 to-transparent mx-auto mt-1" />
              </div>

              {/* Citation & Curriculum Description */}
              <div className="max-w-xl mx-auto space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-700 font-sans leading-relaxed">
                  who has completed the prescribed curriculum, algorithmic challenges, and passed comprehensive technical assessments in
                </p>

                <div className="inline-block px-4 py-1 rounded-md bg-amber-50 border border-amber-300 shadow-2xs">
                  <span className="text-xs sm:text-sm md:text-base font-bold font-serif text-slate-900 tracking-tight">
                    {data.learningPath}
                  </span>
                </div>

                {data.grade && (
                  <p className="text-[10px] sm:text-[11px] font-sans font-semibold text-emerald-800">
                    Graduated with Distinction · {data.grade}
                  </p>
                )}
              </div>
            </div>

            {/* LOWER CREDENTIALS: Signatures, Gold Medallion, and QR Ledger */}
            <div className="relative z-10 pt-2 border-t-2 border-[#b45309]/30">
              <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
                {/* Left Signatory: Vice-Chancellor */}
                <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="w-36 sm:w-48">
                    <div className="h-6 flex items-end justify-center sm:justify-start mb-0.5">
                      <svg viewBox="0 0 160 30" className="w-24 sm:w-28 h-5 text-slate-800 fill-none stroke-current stroke-[1.8]">
                        <path d="M10 22 Q 30 5, 50 20 T 90 15 T 120 12 T 150 20 M 35 12 L 75 10" />
                      </svg>
                    </div>
                    <div className="border-t border-slate-700 pt-0.5">
                      <div className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-900 leading-tight">
                        Prof. (Dr.) Satbir Singh Sehgal
                      </div>
                      <div className="text-[8px] sm:text-[8.5px] font-sans text-slate-600 leading-tight">
                        Vice-Chancellor · Chandigarh University
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle: Official Embossed Gold University Seal Medallion */}
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-500 p-0.5 shadow-md border border-amber-600 flex items-center justify-center">
                    <div className="w-full h-full rounded-full bg-white border border-amber-800/40 flex flex-col items-center justify-center p-0.5 text-[#78350f]">
                      <Award className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700" />
                      <span className="text-[6px] sm:text-[6.5px] font-sans font-black uppercase tracking-tight leading-none mt-0.5">
                        CHANDIGARH UNIV
                      </span>
                      <span className="text-[5.5px] font-sans font-bold tracking-widest text-[#92400e]">
                        OFFICIAL SEAL
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Signatory: Head - Technical Training */}
                <div className="flex flex-col items-center sm:items-end text-center sm:text-right">
                  <div className="w-36 sm:w-48">
                    <div className="h-6 flex items-end justify-center sm:justify-end mb-0.5">
                      <svg viewBox="0 0 160 30" className="w-24 sm:w-28 h-5 text-slate-800 fill-none stroke-current stroke-[1.8]">
                        <path d="M15 20 Q 40 8, 65 18 T 105 14 T 135 20 M 50 14 Q 80 5, 110 18" />
                      </svg>
                    </div>
                    <div className="border-t border-slate-700 pt-0.5">
                      <div className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-900 leading-tight">
                        Ishdeep Singla
                      </div>
                      <div className="text-[8px] sm:text-[8.5px] font-sans text-slate-600 leading-tight">
                        Head - Technical Training (CSE) · CU
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Strip & Digital Verification Info */}
              <div className="mt-2 pt-1 border-t border-amber-600/20 flex flex-wrap items-center justify-between gap-2 text-[7.5px] sm:text-[8.5px] font-mono text-slate-600">
                <div className="flex items-center gap-1.5">
                  {qrCodeUrl && (
                    <img
                      src={qrCodeUrl}
                      alt="Verification QR"
                      className="w-7 h-7 sm:w-8 sm:h-8 border border-slate-300 rounded p-0.5 bg-white"
                    />
                  )}
                  <div>
                    <span className="font-bold text-slate-800">AUTHENTIC DIGITAL CREDENTIAL</span>
                    <p className="text-[7px] text-slate-500">ID: {data.credentialId} · Issued: {formattedDate}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-slate-500 font-sans">Verify online at:</span>
                  <p className="text-slate-800 font-bold truncate max-w-[200px]">{verificationUrl}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
