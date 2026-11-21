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

export function ChandigarhUniversityCertificate({
  data,
  className = "",
}: ChandigarhUniversityCertificateProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  // Clean production verification URL strictly synchronized with active site origin
  const [verificationUrl, setVerificationUrl] = useState<string>(() => {
    return data.verificationUrl || `https://codeskill.chandigarhuniversity.ac.in/verify/${data.credentialId}`;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      setVerificationUrl(`${origin}/verify/${data.credentialId}`);
    }
  }, [data.credentialId]);

  useEffect(() => {
    if (data.credentialId && verificationUrl) {
      QRCode.toDataURL(verificationUrl, {
        width: 200,
        margin: 1,
        color: {
          dark: "#141519",
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
  // Left: Dr. Ishdeep Singla, Assistant Director – Skill Development with authentic blue handwritten signature
  const sigLeft = {
    name: data.signatoryLeft?.name || "Dr. Ishdeep Singla",
    title: data.signatoryLeft?.title || "Assistant Director – Skill Development",
    subtext: data.signatoryLeft?.subtext || "Chandigarh University",
    signatureUrl: data.signatoryLeft?.signatureSvg || "/signatures/singla-signature.png",
  };

  // Right: Prof. (Dr.) Satbir Singh Sehgal, Vice Chancellor only
  const sigRight = {
    name: data.signatoryRight?.name || "Prof. (Dr.) Satbir Singh Sehgal",
    title: data.signatoryRight?.title || "Vice Chancellor",
    subtext: data.signatoryRight?.subtext || "Chandigarh University",
    signatureUrl: data.signatoryRight?.signatureSvg || "/signatures/sehgal-signature.png",
  };

  const certTitle = data.certificateTitle || "CERTIFICATE OF COMPLETION";
  const certSubtitle = data.certificateSubtitle || "This certificate is proudly awarded to";

  // Citation text matching the certificate reference and curriculum
  const citation =
    data.citationText ||
    `in recognition of successfully completing the prescribed curriculum, coding assessments, and practical challenges in`;

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
            background: #faf6ea !important;
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
            background: #faf6ea !important;
          }
        }
      `}</style>

      {/* Main Certificate Canvas: Standard A4 Landscape Proportions (297mm x 210mm) */}
      <div
        id="printable-university-certificate"
        className={`print-certificate-container relative w-full max-w-[960px] mx-auto aspect-[1.414/1] bg-[#faf6ea] text-[#292929] border border-[#e7dcce] shadow-2xl overflow-hidden select-none font-serif flex flex-col justify-between ${className}`}
        style={{
          boxShadow:
            "0 20px 40px -15px rgba(97, 30, 48, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Dynamic Corner Geometric Angular Ribbons + Guaranteed Full SVG Canvas Background Fill */}
        <svg
          viewBox="0 0 1000 707"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        >
          {/* Base SVG fill ensures ivory background prints even if 'Background graphics' is disabled */}
          <rect width="1000" height="707" fill="#faf6ea" />

          {/* Top-Right Deep Wine/Maroon Corner Wedge */}
          <polygon points="840,0 1000,0 1000,160" fill="#611e30" />
          {/* Top-Right Warm Gold/Bronze Slash */}
          <polygon points="770,0 840,0 1000,230 1000,160" fill="#b88256" />

          {/* Bottom-Left Deep Wine/Maroon Corner Wedge */}
          <polygon points="0,547 0,707 160,707" fill="#611e30" />
          {/* Bottom-Left Warm Gold/Bronze Slash */}
          <polygon points="0,477 0,547 160,707 230,707" fill="#b88256" />
        </svg>

        {/* Certificate Content Wrapper with calibrated padding for print and screen */}
        <div className="relative z-10 w-full h-full px-8 sm:px-12 md:px-16 print:px-16 py-6 sm:py-8 md:py-9 print:py-9 flex flex-col justify-between">

          {/* TOP ROW: Official University Logo (Left) & Application Brand Lockup (Right) */}
          <div className="flex items-start justify-between w-full">

            {/* Top-Left: Chandigarh University Official Brand Logo */}
            <div className="flex items-center">
              <img
                src="/cu-logo-tight.png"
                alt="Chandigarh University"
                className="h-11 sm:h-14 md:h-16 print:h-16 w-auto object-contain block"
              />
            </div>

            {/* Top-Right: Application Logo, Name & Skill Development with comfortable ribbon clearance */}
            <div className="flex items-center gap-2.5 sm:gap-3 pr-12 sm:pr-16 md:pr-20 print:pr-20">
              {/* Application Logo Icon */}
              <div className="relative w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 print:w-11 print:h-11 rounded-lg overflow-hidden bg-slate-950 border border-black/10 shadow-xs flex items-center justify-center p-1.5 shrink-0">
                <svg viewBox="0 0 160 160" className="w-full h-full" fill="none">
                  <polygon
                    points="80,10 145,45 145,115 80,150 15,115 15,45"
                    fill="#0F172A"
                    stroke="#FFFFFF"
                    strokeWidth="8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M60 62 L40 80 L60 98"
                    stroke="#FFFFFF"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M85 55 L75 105"
                    stroke="#FFFFFF"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <path
                    d="M100 62 L120 80 L100 98"
                    stroke="#38BDF8"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Application Name & Subtitle */}
              <div className="flex flex-col text-left">
                <span className="font-sans font-extrabold text-base sm:text-lg md:text-xl print:text-xl tracking-tight text-[#1a2d57] leading-tight">
                  CodeSkill
                </span>
                <span className="text-[8px] sm:text-[9.5px] print:text-[9.5px] font-sans font-bold tracking-wider text-slate-500 uppercase leading-none mt-0.5">
                  Skill Development
                </span>
              </div>
            </div>
          </div>

          {/* MAIN DIPLOMA BODY: Commanding, Prominent Typography */}
          <div className="text-center my-auto py-2 sm:py-3 print:py-3 space-y-2.5 sm:space-y-3 print:space-y-3">
            {/* Header: CERTIFICATE OF COMPLETION */}
            <h1 className="text-3xl sm:text-4xl md:text-[44px] print:text-[44px] font-serif font-black tracking-[0.18em] sm:tracking-[0.22em] print:tracking-[0.22em] text-[#1a2d57] uppercase leading-tight">
              {certTitle}
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base md:text-lg print:text-lg font-serif text-slate-700 tracking-wide italic">
              {certSubtitle}
            </p>

            {/* Recipient Name with Solid Deep Navy Underline */}
            <div className="pt-2 sm:pt-3 print:pt-3 pb-1">
              <h2 className="text-3.5xl sm:text-5xl md:text-[54px] print:text-[54px] font-serif font-black tracking-wider text-[#1a2d57] uppercase leading-none">
                {data.recipientName || "Mustakim Shaikh"}
              </h2>
              <div className="w-72 sm:w-96 md:w-[500px] print:w-[520px] h-[2.5px] bg-[#1a2d57] mx-auto mt-3" />
            </div>

            {/* Citation Statement */}
            <div className="max-w-2xl mx-auto pt-1 sm:pt-2 space-y-1.5">
              <p className="text-xs sm:text-sm md:text-[15px] print:text-[15px] text-slate-700 font-serif leading-relaxed px-4">
                {citation}
              </p>
              {data.learningPath && (
                <div className="font-bold text-[#1a2d57] text-base sm:text-lg md:text-[21px] print:text-[21px] font-serif my-1.5">
                  {data.learningPath}
                </div>
              )}
              <p className="text-[11px] sm:text-xs md:text-[13px] print:text-[13px] text-slate-600 font-serif">
                at Chandigarh University, contributing with dedication, technical rigor, and excellence.
              </p>
            </div>
          </div>

          {/* BOTTOM SECTION: SIGNATORIES & CENTER-BOTTOM QR CODE */}
          <div className="w-full pt-2">
            <div className="grid grid-cols-3 items-end">
              {/* Left Column: Head / Assistant Director with Signature */}
              <div className="flex flex-col items-center text-center">
                <div className="w-36 sm:w-48 md:w-56 print:w-56">
                  {/* Handwritten Blue Signature */}
                  <div className="h-12 sm:h-14 md:h-16 print:h-16 flex items-end justify-center mb-0.5">
                    {sigLeft.signatureUrl ? (
                      <img
                        src={sigLeft.signatureUrl}
                        alt="Signature Ishdeep Singla"
                        className="h-12 sm:h-14 md:h-16 print:h-16 w-auto max-w-[140px] sm:max-w-[180px] print:max-w-[180px] object-contain block drop-shadow-2xs"
                      />
                    ) : (
                      <svg
                        viewBox="0 0 160 30"
                        className="w-24 sm:w-28 h-6 text-blue-700 fill-none stroke-current stroke-[2]"
                      >
                        <path d="M10 24 Q 28 6, 45 22 T 85 16 T 115 12 T 145 22 M 30 14 L 70 12" />
                      </svg>
                    )}
                  </div>
                  {/* Signature Line */}
                  <div className="border-t-2 border-[#1a2d57]/70 pt-1.5">
                    <div className="text-xs sm:text-sm md:text-base print:text-base font-serif font-bold text-[#1a2d57] leading-tight">
                      {sigLeft.name}
                    </div>
                    <div className="text-[9px] sm:text-[10px] md:text-xs print:text-xs font-sans font-bold tracking-wider text-slate-800 uppercase mt-0.5">
                      {sigLeft.title}
                    </div>
                    {sigLeft.subtext && (
                      <div className="text-[8px] sm:text-[8.5px] md:text-[9.5px] print:text-[9.5px] font-mono text-slate-600 mt-0.5">
                        {sigLeft.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Center Column: Scannable Credential QR Code in Center Bottom (Prominent & Clear) */}
              <div className="flex flex-col items-center justify-center text-center -mb-0.5">
                {qrCodeUrl && (
                  <div className="flex flex-col items-center">
                    <img
                      src={qrCodeUrl}
                      alt="Verify Credential QR"
                      className="w-16 h-16 sm:w-20 sm:h-20 md:w-22 md:h-22 print:w-22 print:h-22 border border-slate-300 rounded-lg bg-white p-1 shadow-2xs"
                    />
                    <span className="text-[8px] sm:text-[9px] md:text-[10px] print:text-[10px] font-mono text-slate-600 tracking-wider mt-1 uppercase font-semibold">
                      Scan to Verify
                    </span>
                  </div>
                )}
              </div>

              {/* Right Column: Vice Chancellor with Executive Signature */}
              <div className="flex flex-col items-center text-center">
                <div className="w-36 sm:w-48 md:w-56 print:w-56">
                  {/* Handwritten Executive Signature */}
                  <div className="h-12 sm:h-14 md:h-16 print:h-16 flex items-end justify-center mb-0.5">
                    {sigRight.signatureUrl ? (
                      <img
                        src={sigRight.signatureUrl}
                        alt="Signature Prof. (Dr.) Satbir Singh Sehgal"
                        className="h-12 sm:h-14 md:h-16 print:h-16 w-auto max-w-[140px] sm:max-w-[180px] print:max-w-[180px] object-contain block drop-shadow-2xs"
                      />
                    ) : (
                      <svg
                        viewBox="0 0 160 30"
                        className="w-24 sm:w-28 h-6 text-slate-900 fill-none stroke-current stroke-[2]"
                      >
                        <path d="M12 22 Q 38 7, 60 20 T 100 14 T 132 22 M 45 15 Q 75 6, 105 18" />
                      </svg>
                    )}
                  </div>
                  {/* Signature Line */}
                  <div className="border-t-2 border-[#1a2d57]/70 pt-1.5">
                    <div className="text-xs sm:text-sm md:text-base print:text-base font-serif font-bold text-[#1a2d57] leading-tight">
                      {sigRight.name}
                    </div>
                    <div className="text-[9px] sm:text-[10px] md:text-xs print:text-xs font-sans font-bold tracking-wider text-slate-800 uppercase mt-0.5">
                      {sigRight.title}
                    </div>
                    {sigRight.subtext && (
                      <div className="text-[8px] sm:text-[8.5px] md:text-[9.5px] print:text-[9.5px] font-mono text-slate-600 mt-0.5">
                        {sigRight.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Credential ID Verification Footer Strip (Authenticity URL completely removed) */}
            <div className="mt-2.5 pt-1 border-t border-slate-300/70 flex items-center justify-center text-[8.5px] sm:text-[9.5px] md:text-[10.5px] print:text-[10.5px] font-mono text-slate-500">
              <span>
                CREDENTIAL ID:{" "}
                <strong className="text-slate-800 font-bold tracking-wider">{data.credentialId}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
