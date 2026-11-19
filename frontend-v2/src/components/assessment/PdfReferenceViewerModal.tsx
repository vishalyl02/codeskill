"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, X } from "lucide-react";

interface PdfReferenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  referencePdfUrl?: string;
}

export default function PdfReferenceViewerModal({
  isOpen,
  onClose,
  referencePdfUrl,
}: PdfReferenceViewerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && referencePdfUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl w-full max-w-4xl text-slate-100 flex flex-col h-[650px]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-sm">Approved Reference Material</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              <iframe
                src={referencePdfUrl}
                title="Approved Exam Reference Material"
                className="w-full h-full border-0"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
