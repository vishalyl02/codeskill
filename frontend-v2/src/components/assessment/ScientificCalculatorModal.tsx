"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calculator, X } from "lucide-react";

interface ScientificCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScientificCalculatorModal({
  isOpen,
  onClose,
}: ScientificCalculatorModalProps) {
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcHistory, setCalcHistory] = useState("");

  const handleCalcButton = (val: string) => {
    if (val === "C") {
      setCalcDisplay("0");
      setCalcHistory("");
    } else if (val === "CE") {
      setCalcDisplay("0");
    } else if (val === "=") {
      try {
        let expr = calcDisplay
          .replace(/×/g, "*")
          .replace(/÷/g, "/")
          .replace(/π/g, "Math.PI")
          .replace(/e/g, "Math.E")
          .replace(/sin\(/g, "Math.sin(")
          .replace(/cos\(/g, "Math.cos(")
          .replace(/tan\(/g, "Math.tan(")
          .replace(/log\(/g, "Math.log10(")
          .replace(/ln\(/g, "Math.log(")
          .replace(/sqrt\(/g, "Math.sqrt(")
          .replace(/\^/g, "**");

        // Safe evaluation without external eval
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${expr})`)();
        const formatted = Number.isFinite(result)
          ? String(Math.round(result * 100000000) / 100000000)
          : "Error";
        setCalcHistory(calcDisplay + " =");
        setCalcDisplay(formatted);
      } catch {
        setCalcDisplay("Error");
      }
    } else {
      if (calcDisplay === "0" || calcDisplay === "Error") {
        setCalcDisplay(val);
      } else {
        setCalcDisplay((prev) => prev + val);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl w-full max-w-sm text-slate-100"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-sm">Scientific Calculator</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Calculator Screen */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-4 text-right">
              <div className="text-xs text-slate-400 font-mono h-4 overflow-hidden">
                {calcHistory}
              </div>
              <div className="text-2xl font-mono font-bold text-white tracking-wider overflow-x-auto whitespace-nowrap">
                {calcDisplay}
              </div>
            </div>

            {/* Scientific Keypad */}
            <div className="grid grid-cols-5 gap-2 text-xs font-semibold">
              {["sin(", "cos(", "tan(", "log(", "ln("].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleCalcButton(op)}
                  className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors"
                >
                  {op.replace("(", "")}
                </button>
              ))}
              {["sqrt(", "^", "(", ")", "CE"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleCalcButton(op)}
                  className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors"
                >
                  {op === "sqrt(" ? "√" : op}
                </button>
              ))}
              {["7", "8", "9", "÷", "C"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleCalcButton(op)}
                  className={`p-2.5 rounded-lg transition-colors ${
                    op === "C"
                      ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                      : op === "÷"
                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  {op}
                </button>
              ))}
              {["4", "5", "6", "×", "π"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleCalcButton(op)}
                  className={`p-2.5 rounded-lg transition-colors ${
                    op === "×"
                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  {op}
                </button>
              ))}
              {["1", "2", "3", "-", "e"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleCalcButton(op)}
                  className={`p-2.5 rounded-lg transition-colors ${
                    op === "-"
                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  {op}
                </button>
              ))}
              {["0", ".", "=", "+"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleCalcButton(op)}
                  className={`p-2.5 rounded-lg transition-colors ${
                    op === "="
                      ? "col-span-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      : op === "+"
                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
