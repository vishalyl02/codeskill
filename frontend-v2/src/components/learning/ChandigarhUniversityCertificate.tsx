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
        width: 180,
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

        {/* Certificate Content Wrapper: Calibrated padding to prevent any clipping on screen & print */}
        <div className="relative z-10 w-full h-full px-6 sm:px-10 md:px-14 print:px-16 py-3.5 sm:py-5 md:py-6 print:py-8 flex flex-col justify-between">

          {/* TOP ROW: Official University Logo (Left) & Application Brand Lockup (Right) */}
          <div className="flex items-start justify-between w-full">

            {/* Top-Left: Chandigarh University Official Brand Logo (Fully transparent background, blends flawlessly) */}
            <div className="flex items-center">
              <img
                src="/cu-logo-transparent.png"
                alt="Chandigarh University"
                className="h-9 sm:h-11 md:h-13 print:h-15 w-auto object-contain block"
              />
            </div>

            {/* Top-Right: Application Logo, Name & Skill Development */}
            <div className="flex items-center gap-2 sm:gap-2.5 pr-10 sm:pr-14 md:pr-18 print:pr-20">
              {/* Application Logo Icon */}
              <div className="relative w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 print:w-11 print:h-11 rounded-lg overflow-hidden bg-slate-950 border border-black/10 shadow-xs flex items-center justify-center p-1 sm:p-1.5 shrink-0">
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
                <span className="font-sans font-extrabold text-sm sm:text-base md:text-lg print:text-xl tracking-tight text-[#1a2d57] leading-tight">
                  CodeSkill
                </span>
                <span className="text-[7px] sm:text-[8px] md:text-[9px] print:text-[10px] font-sans font-bold tracking-wider text-[#292929] uppercase leading-none mt-0.5">
                  Skill Development
                </span>
              </div>
            </div>
          </div>

          {/* MAIN DIPLOMA BODY: Flawless Typography, Single-Line Recipient Name, Balanced Vertical Hierarchy */}
          <div className="text-center my-auto py-1 sm:py-2 print:py-3 space-y-1 sm:space-y-1.5 md:space-y-2 print:space-y-2.5">
            {/* Header: CERTIFICATE OF COMPLETION */}
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-[34px] print:text-[42px] font-serif font-black tracking-[0.16em] sm:tracking-[0.2em] print:tracking-[0.22em] text-[#1a2d57] uppercase leading-tight">
              {certTitle}
            </h1>

            {/* Subtitle */}
            <p className="text-[11px] sm:text-xs md:text-sm print:text-base font-serif text-slate-700 tracking-wide italic">
              {certSubtitle}
            </p>

            {/* Recipient Name: Guaranteed Single-Line with Scaled Proportions & Solid Underline */}
            <div className="pt-1 sm:pt-1.5 md:pt-2 print:pt-2.5 pb-0.5 max-w-full overflow-hidden">
              <h2 className="text-xl sm:text-2.5xl md:text-3.5xl lg:text-4xl print:text-[46px] font-serif font-black tracking-wide text-[#1a2d57] uppercase leading-none whitespace-nowrap truncate px-2">
                {data.recipientName || "Mustakim Shaikh"}
              </h2>
              <div className="w-48 sm:w-64 md:w-80 print:w-[480px] h-[1.5px] sm:h-[2px] bg-[#1a2d57] mx-auto mt-1.5 sm:mt-2 print:mt-2.5" />
            </div>

            {/* Citation Statement */}
            <div className="max-w-xl md:max-w-2xl mx-auto pt-0.5 sm:pt-1 space-y-0.5 sm:space-y-1">
              <p className="text-[9.5px] sm:text-[11px] md:text-xs print:text-[14px] text-slate-700 font-serif leading-relaxed px-4">
                {citation}
              </p>
              {data.learningPath && (
                <div className="font-bold text-[#1a2d57] text-xs sm:text-sm md:text-base print:text-[19px] font-serif my-0.5 sm:my-1 print:my-1.5">
                  {data.learningPath}
                </div>
              )}
              <p className="text-[8.5px] sm:text-[9.5px] md:text-[11px] print:text-[12px] text-slate-600 font-serif">
                at Chandigarh University, contributing with dedication, technical rigor, and excellence.
              </p>
            </div>
          </div>

          {/* BOTTOM SECTION: SIGNATORIES & CENTER-BOTTOM QR CODE (Zero clipping, full clearance) */}
          <div className="w-full pt-1 sm:pt-1.5 print:pt-2">
            <div className="grid grid-cols-3 items-end">
              {/* Left Column: Head / Assistant Director with Signature */}
              <div className="flex flex-col items-center text-center">
                <div className="w-32 sm:w-40 md:w-48 print:w-56">
                  {/* Handwritten Blue Signature */}
                  <div className="h-8 sm:h-10 md:h-12 print:h-16 flex items-end justify-center mb-0.5">
                    {sigLeft.signatureUrl ? (
                      <img
                        src={sigLeft.signatureUrl}
                        alt="Signature Ishdeep Singla"
                        className="max-h-8 sm:max-h-10 md:max-h-12 print:max-h-16 w-auto max-w-[110px] sm:max-w-[140px] print:max-w-[170px] object-contain block drop-shadow-2xs"
                      />
                    ) : (
                      <svg
                        viewBox="0 0 160 30"
                        className="w-20 sm:w-24 h-5 text-blue-700 fill-none stroke-current stroke-[2]"
                      >
                        <path d="M10 24 Q 28 6, 45 22 T 85 16 T 115 12 T 145 22 M 30 14 L 70 12" />
                      </svg>
                    )}
                  </div>
                  {/* Signature Line */}
                  <div className="border-t sm:border-t-2 border-[#1a2d57]/70 pt-1 print:pt-1.5">
                    <div className="text-[10.5px] sm:text-xs md:text-sm print:text-base font-serif font-bold text-[#1a2d57] leading-tight">
                      {sigLeft.name}
                    </div>
                    <div className="text-[7.5px] sm:text-[8.5px] md:text-[9.5px] print:text-xs font-sans font-bold tracking-wider text-slate-800 uppercase mt-0.5 leading-tight">
                      {sigLeft.title}
                    </div>
                    {sigLeft.subtext && (
                      <div className="text-[7px] sm:text-[8px] md:text-[9px] print:text-[10px] font-sans font-bold tracking-wide text-slate-700 mt-0.5 leading-tight">
                        {sigLeft.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Center Column: Scannable Credential QR Code in Center Bottom */}
              <div className="flex flex-col items-center justify-center text-center -mb-0.5">
                {qrCodeUrl && (
                  <div className="flex flex-col items-center">
                    <img
                      src={qrCodeUrl}
                      alt="Verify Credential QR"
                      className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 print:w-20 print:h-20 border border-slate-300 rounded-lg bg-white p-1 shadow-2xs"
                    />
                    <span className="text-[7px] sm:text-[8px] md:text-[9px] print:text-[9.5px] font-mono text-slate-600 tracking-wider mt-0.5 uppercase font-semibold">
                      Scan to Verify
                    </span>
                  </div>
                )}
              </div>

              {/* Right Column: Vice Chancellor with Executive Signature */}
              <div className="flex flex-col items-center text-center">
                <div className="w-32 sm:w-40 md:w-48 print:w-56">
                  {/* Handwritten Executive Signature */}
                  <div className="h-8 sm:h-10 md:h-12 print:h-16 flex items-end justify-center mb-0.5">
                    {sigRight.signatureUrl ? (
                      <img
                        src={sigRight.signatureUrl}
                        alt="Signature Prof. (Dr.) Satbir Singh Sehgal"
                        className="max-h-8 sm:max-h-10 md:max-h-12 print:max-h-16 w-auto max-w-[110px] sm:max-w-[140px] print:max-w-[170px] object-contain block drop-shadow-2xs"
                      />
                    ) : (
                      <svg
                        viewBox="0 0 160 30"
                        className="w-20 sm:w-24 h-5 text-slate-900 fill-none stroke-current stroke-[2]"
                      >
                        <path d="M12 22 Q 38 7, 60 20 T 100 14 T 132 22 M 45 15 Q 75 6, 105 18" />
                      </svg>
                    )}
                  </div>
                  {/* Signature Line */}
                  <div className="border-t sm:border-t-2 border-[#1a2d57]/70 pt-1 print:pt-1.5">
                    <div className="text-[10.5px] sm:text-xs md:text-sm print:text-base font-serif font-bold text-[#1a2d57] leading-tight">
                      {sigRight.name}
                    </div>
                    <div className="text-[7.5px] sm:text-[8.5px] md:text-[9.5px] print:text-xs font-sans font-bold tracking-wider text-slate-800 uppercase mt-0.5 leading-tight">
                      {sigRight.title}
                    </div>
                    {sigRight.subtext && (
                      <div className="text-[7px] sm:text-[8px] md:text-[9px] print:text-[10px] font-sans font-bold tracking-wide text-slate-700 mt-0.5 leading-tight">
                        {sigRight.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Credential ID Verification Footer Strip (Continuous divider removed for clean presentation) */}
            <div className="mt-1.5 sm:mt-2 print:mt-2.5 pt-0.5 sm:pt-1 flex items-center justify-center text-[7px] sm:text-[8px] md:text-[9px] print:text-[10px] font-mono text-slate-500">
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
