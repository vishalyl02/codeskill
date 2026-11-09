"use client";

import { isDocumentFullscreen } from "@/lib/fullscreen";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize } from "lucide-react";

interface ContestStartGateProps {
  onAccept: (password?: string) => void | Promise<void>;
  requestFullscreen: () => Promise<void>;
  isFullscreen: boolean;
  hasRequestedFullscreen: boolean;
  isPrivate?: boolean;
  requireFullscreen?: boolean;
  maxViolations?: number;
  action?: string;
}

export function ContestStartGate({
  onAccept,
  requestFullscreen,
  isPrivate = false,
  requireFullscreen = true,
  maxViolations = 3,
  action = "auto_submit",
}: ContestStartGateProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [password, setPassword] = useState("");
  const startInProgress = useRef(false);

  const handleStart = async () => {
    if (!agreed || (isPrivate && !password.trim()) || startInProgress.current) return;
    startInProgress.current = true;
    setLoading(true);

    try {
      setFullscreenError("");
      if (requireFullscreen && !isDocumentFullscreen()) await requestFullscreen();
      if (requireFullscreen && !isDocumentFullscreen()) { setFullscreenError("Fullscreen is required. Allow fullscreen and try again."); return; }
      await onAccept(isPrivate ? password : undefined);
    } catch (error) {
      setFullscreenError(error instanceof Error ? error.message : "Unable to enter fullscreen. Please try again.");
    } finally { startInProgress.current = false; setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl max-w-2xl w-full shadow-2xl">
        <h1 className="text-3xl font-bold text-white mb-6">CodeSkill Secure Environment</h1>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 mb-6 h-64 overflow-y-auto">
          <h2 className="text-xl font-semibold text-white mb-4">Contest Rules & Anti-Cheat Policy</h2>
          <ul className="list-disc pl-5 space-y-2 text-zinc-400">
            {requireFullscreen && <li>You must remain in <strong className="text-white">Fullscreen Mode</strong> for the duration of the contest.</li>}
            <li>Do not switch tabs, minimize the browser, or open other applications.</li>
            <li>Copying code from external sources and pasting is strictly prohibited.</li>
            <li>Right-clicking and Developer Tools are disabled.</li>
            <li>Exceeding the configured limit of <strong className="text-white">{maxViolations} violations</strong> (tab-switching, leaving the contest page, or exiting fullscreen) will trigger the policy: <strong className="text-white">{action === 'lock_attempt' ? 'Session Lock' : action === 'flag_review' ? 'Administrative Review Flag' : 'Immediate Auto-Submission'}</strong>.</li>
            <li>Your activity, device fingerprint, and IP address are monitored in real-time.</li>
          </ul>
        </div>

        {isPrivate && (
          <div className="mb-6 space-y-2">
            <label htmlFor="private-contest-password" className="block text-sm font-medium text-zinc-200">
              Private contest password
            </label>
            <input
              id="private-contest-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter the password provided by the administrator"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        )}

        <label className="flex items-center space-x-3 mb-8 cursor-pointer">
          <input type="checkbox" aria-label="Agree to contest rules" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="w-5 h-5 accent-primary shrink-0" />
          <span className="text-zinc-300 select-none">
            I have read and agree to follow all contest rules. I understand that violations may lead to disqualification.
          </span>
        </label>

        {fullscreenError && <p role="alert" className="text-sm text-red-400 mb-4">{fullscreenError}</p>}
        <div className="flex justify-end">
          <Button
            disabled={!agreed || (isPrivate && !password.trim()) || loading}
            onClick={handleStart}
            size="lg"
            className="w-full sm:w-auto"
          >
            <Maximize className="mr-2 h-4 w-4" />
            {loading ? "Entering Secure Mode..." : isPrivate ? "Verify Password & Start" : (requireFullscreen ? "Enter Fullscreen & Start" : "Start Contest")}
          </Button>
        </div>
      </div>
    </div>
  );
}
