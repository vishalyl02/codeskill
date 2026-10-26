"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

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
  certificateTitle?: string;
  certificateSubtitle?: string;
  citationText?: string;
  signatoryLeft?: {
    name: string;
    title: string;
    subtext?: string;
    signatureSvg?: string;
  };
  signatoryRight?: {
    name: string;
    title: string;
    subtext?: string;
    signatureSvg?: string;
  };
}

interface ChandigarhUniversityCertificateProps {
  data: CertificateData;
  className?: string;
}

/**
 * Authentic Golden Rosette Medallion with Dual Ribbon Tails
 * Matching the Chandigarh University certificate standard.
 */
function GoldenRosette({ className = "w-16 h-20 sm:w-20 sm:h-24" }: { className?: string }) {
  const petals = Array.from({ length: 24 }).map((_, i) => {
    const angle = (i * 360) / 24;
    return (
      <polygon
        key={i}
        points="50,14 47,20 53,20"
        fill="#f59e0b"
        transform={`rotate(${angle} 50 50)`}
      />
    );
  });

  return (
    <svg
      viewBox="0 0 100 130"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="25%" stopColor="#fbbf24" />
          <stop offset="70%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="goldCenter" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fde047" />
        </linearGradient>
        <filter id="rosetteShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#78350f" floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter="url(#rosetteShadow)">
        {/* Left Ribbon Tail */}
        <polygon
          points="44,58 35,118 47,105 53,116 53,58"
          fill="url(#goldGrad)"
          stroke="#b45309"
          strokeWidth="0.8"
        />
        {/* Right Ribbon Tail */}
        <polygon
          points="55,58 55,116 61,105 73,118 64,58"
          fill="url(#goldGrad)"
          stroke="#b45309"
          strokeWidth="0.8"
        />

        {/* Pleated Rosette Scallop Outer Ring */}
        <circle cx="50" cy="50" r="36" fill="#d97706" stroke="#b45309" strokeWidth="1" />
        {/* 24 Scalloped / Pleated Petals */}
        {petals}
        {/* Middle Gold Rosette Ring */}
        <circle cx="50" cy="50" r="33" fill="url(#goldGrad)" />
        <circle
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke="#b45309"
          strokeWidth="1.2"
          strokeDasharray="2,2"
        />
        {/* Inner Rosette Center */}
        <circle cx="50" cy="50" r="26" fill="url(#goldCenter)" stroke="#d97706" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="22" fill="none" stroke="#f59e0b" strokeWidth="1" />

        {/* Inner Medal Star Emblem */}
        <polygon
          points="50,38 53,46 61,46 55,51 57,59 50,54 43,59 45,51 39,46 47,46"
          fill="#d97706"
        />
      </g>
    </svg>
  );
}

export function ChandigarhUniversityCertificate({
  data,
  className = "",
}: ChandigarhUniversityCertificateProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  // Clean production verification URL — strictly avoiding localhost or port numbers
  const officialDomain = "https://codeskill.chandigarhuniversity.ac.in";
  const rawUrl = data.verificationUrl || `${officialDomain}/verify/${data.credentialId}`;
  const verificationUrl = rawUrl.replace(/https?:\/\/localhost(:\d+)?/gi, officialDomain);

  useEffect(() => {
    if (data.credentialId) {
      QRCode.toDataURL(verificationUrl, {
        width: 140,
        margin: 1,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      })
        .then(setQrCodeUrl)
        .catch((err) => {
          console.error("Failed to generate QR code", err);
        });
    }
  }, [data.credentialId, verificationUrl]);

  // University signatories as specified by leadership
  const sigLeft = {
    name: data.signatoryLeft?.name || "Prof. (Dr.) Satbir Singh Sehgal",
    title: data.signatoryLeft?.title || "Vice-Chancellor",
    subtext: data.signatoryLeft?.subtext || "E18146 · vc@cumail.in",
  };

  const sigRight = {
    name: data.signatoryRight?.name || "Ishdeep Singla",
    title: data.signatoryRight?.title || "Head - Technical Training (CSE)",
    subtext: data.signatoryRight?.subtext || "E16430 · ad.skill@cumail.in",
  };

  const certTitle = data.certificateTitle || "CERTIFICATE OF COMPLETION";
  const certSubtitle = data.certificateSubtitle || "This certificate is proudly awarded to";

  // Citation text matching the certificate reference and curriculum
  const citation =
    data.citationText ||
    `in recognition of successfully completing the prescribed algorithmic curriculum, coding assessments, and practical challenges in`;

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
            border: none !important;
            z-index: 9999999 !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            page-break-inside: avoid !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* Main Certificate Canvas: Standard A4 Landscape Proportions (297mm x 210mm) */}
      <div
        id="printable-university-certificate"
        className={`print-certificate-container relative w-full max-w-[940px] mx-auto aspect-[1.414/1] bg-white text-slate-900 shadow-2xl overflow-hidden select-none font-serif flex flex-col justify-between ${className}`}
        style={{
          boxShadow:
            "0 20px 40px -15px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Dynamic Corner Geometric Angular Ribbons (Black & Crimson Red) */}
        <svg
          viewBox="0 0 1000 707"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        >
          {/* Top-Right Black Corner Wedge */}
          <polygon points="790,0 1000,0 1000,210" fill="#0d0d0f" />
          {/* Top-Right Crimson Red Slash */}
          <polygon points="700,0 790,0 1000,285 1000,210" fill="#d91b24" />

          {/* Bottom-Left Black Corner Wedge */}
          <polygon points="0,497 0,707 210,707" fill="#0d0d0f" />
          {/* Bottom-Left Crimson Red Slash */}
          <polygon points="0,422 0,497 210,707 300,707" fill="#d91b24" />
        </svg>

        {/* Certificate Content Wrapper */}
        <div className="relative z-10 w-full h-full px-8 sm:px-14 md:px-18 py-6 sm:py-8 md:py-10 flex flex-col justify-between">
          {/* TOP ROW: University Brand Logos */}
          <div className="flex items-start justify-between w-full">
            {/* Top-Left: Chandigarh University Official Brand Logo */}
            <div className="flex items-center">
              <img
                src="/cu-logo-tight.png"
                alt="Chandigarh University"
                className="h-10 sm:h-12 md:h-14 w-auto object-contain block"
              />
            </div>

            {/* Top-Right: Department & Platform Brand Lockup */}
            <div className="text-right flex flex-col items-end pr-8 sm:pr-14">
              <div className="flex flex-col items-center">
                <span className="text-[7px] sm:text-[8px] font-sans font-bold tracking-[0.2em] text-slate-600 uppercase">
                  DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING
                </span>
                <span className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-[#b91c1c] font-sans uppercase leading-none drop-shadow-xs my-0.5">
                  CODESKILL
                </span>
                <span className="text-[6.5px] sm:text-[7.5px] font-sans font-bold tracking-widest text-slate-800 uppercase">
                  APEX INSTITUTE OF TECHNOLOGY · CU
                </span>
              </div>
            </div>
          </div>

          {/* MAIN DIPLOMA BODY: Centered Academic Typography */}
          <div className="text-center my-auto py-1 sm:py-2 space-y-1.5 sm:space-y-2">
            {/* Header: CERTIFICATE OF COMPLETION */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-black tracking-[0.14em] sm:tracking-[0.18em] text-slate-900 uppercase">
              {certTitle}
            </h1>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm md:text-base font-serif text-slate-700 tracking-wide">
              {certSubtitle}
            </p>

            {/* Recipient Name with Solid Underline */}
            <div className="pt-2 sm:pt-3 pb-1">
              <h2 className="text-2xl sm:text-3xl md:text-4.5xl font-serif font-black tracking-wider text-slate-900 uppercase">
                {data.recipientName || "Mustakim Shaikh"}
              </h2>
              <div className="w-64 sm:w-80 md:w-96 h-[1.5px] bg-slate-900 mx-auto mt-2" />
            </div>

            {/* Citation Statement */}
            <div className="max-w-xl mx-auto pt-1 sm:pt-2 space-y-1">
              <p className="text-[11px] sm:text-xs md:text-[13px] text-slate-700 font-serif leading-relaxed px-4">
                {citation}
              </p>
              {data.learningPath && (
                <div className="font-bold text-slate-900 text-xs sm:text-sm md:text-base font-serif">
                  {data.learningPath}
                </div>
              )}
              <p className="text-[10px] sm:text-[11.5px] text-slate-600 font-serif">
                at Chandigarh University, contributing with dedication, technical rigor, and excellence.
              </p>
            </div>
          </div>

          {/* BOTTOM SIGNATORIES & GOLDEN ROSETTE MEDALLION */}
          <div className="w-full pt-2">
            <div className="grid grid-cols-3 items-end">
              {/* Left Column: Vice-Chancellor */}
              <div className="flex flex-col items-center text-center">
                <div className="w-36 sm:w-48 md:w-56">
                  {/* Handwritten Signature Curve */}
                  <div className="h-7 sm:h-8 flex items-end justify-center mb-0.5">
                    <svg
                      viewBox="0 0 160 30"
                      className="w-24 sm:w-28 h-6 text-slate-900 fill-none stroke-current stroke-[2]"
                    >
                      <path d="M10 24 Q 28 6, 45 22 T 85 16 T 115 12 T 145 22 M 30 14 L 70 12" />
                    </svg>
                  </div>
                  {/* Signature Line */}
                  <div className="border-t border-slate-900 pt-1">
                    <div className="text-[11px] sm:text-xs md:text-sm font-serif font-bold text-slate-900 leading-tight">
                      {sigLeft.name}
                    </div>
                    <div className="text-[8.5px] sm:text-[9.5px] font-sans font-bold tracking-wider text-slate-800 uppercase mt-0.5">
                      {sigLeft.title}
                    </div>
                    {sigLeft.subtext && (
                      <div className="text-[7.5px] sm:text-[8px] font-mono text-slate-600 mt-0.5">
                        {sigLeft.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Center Column: Golden Ribbon Rosette Medallion */}
              <div className="flex flex-col items-center justify-center text-center -mb-2">
                <GoldenRosette className="w-16 h-20 sm:w-20 sm:h-24 md:w-22 md:h-26" />
              </div>

              {/* Right Column: Head - Technical Training (CSE) */}
              <div className="flex flex-col items-center text-center">
                <div className="w-36 sm:w-48 md:w-56">
                  {/* Handwritten Signature Curve */}
                  <div className="h-7 sm:h-8 flex items-end justify-center mb-0.5">
                    <svg
                      viewBox="0 0 160 30"
                      className="w-24 sm:w-28 h-6 text-slate-900 fill-none stroke-current stroke-[2]"
                    >
                      <path d="M12 22 Q 38 7, 60 20 T 100 14 T 132 22 M 45 15 Q 75 6, 105 18" />
                    </svg>
                  </div>
                  {/* Signature Line */}
                  <div className="border-t border-slate-900 pt-1">
                    <div className="text-[11px] sm:text-xs md:text-sm font-serif font-bold text-slate-900 leading-tight">
                      {sigRight.name}
                    </div>
                    <div className="text-[8.5px] sm:text-[9.5px] font-sans font-bold tracking-wider text-slate-800 uppercase mt-0.5">
                      {sigRight.title}
                    </div>
                    {sigRight.subtext && (
                      <div className="text-[7.5px] sm:text-[8px] font-mono text-slate-600 mt-0.5">
                        {sigRight.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Discrete Digital Ledger & Verification Strip */}
            <div className="mt-3 pt-1 border-t border-slate-200 flex items-center justify-between text-[7px] sm:text-[8px] font-mono text-slate-500">
              <div className="flex items-center gap-1.5">
                {qrCodeUrl && (
                  <img
                    src={qrCodeUrl}
                    alt="Verify QR"
                    className="w-5 h-5 border border-slate-300 rounded p-0.5 bg-white"
                  />
                )}
                <span>
                  CREDENTIAL ID:{" "}
                  <strong className="text-slate-700">{data.credentialId}</strong>
                </span>
              </div>
              <div>
                <span>AUTHENTICITY REGISTRY: </span>
                <span className="text-slate-700 font-semibold">
                  https://codeskill.chandigarhuniversity.ac.in
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
