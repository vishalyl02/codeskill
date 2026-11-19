"use client";

import { enterDocumentFullscreen, fullscreenEvents, isDocumentFullscreen } from "@/lib/fullscreen";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Maximize, AlertTriangle, VideoOff, MicOff, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/config/api';
import { pacingTelemetry } from '@/lib/pacing-telemetry';
import ForensicWatermarkOverlay from './ForensicWatermarkOverlay';

interface SafeExamBrowserProps {
  children: React.ReactNode;
  maxWarnings?: number;
  onTerminate?: () => void;
  onViolation?: (type: string, message: string, metadata?: Record<string, any>) => void;
  onFullscreenEntered?: () => void | Promise<void>;
  isEnabled?: boolean;
  requireFullscreen?: boolean;
  detectTabSwitch?: boolean;
  blockCopyPaste?: boolean;
  monitorViolations?: boolean;
  autoSubmitOnViolation?: boolean;
  activeMediaStream?: MediaStream | null;
  requireCamera?: boolean;
  requireMicrophone?: boolean;
  isExamSubmitted?: boolean;
  assessmentId?: string;
  candidateId?: string;
  candidateIdentifier?: string;
  attestationSessionId?: string;
  enableForensicWatermark?: boolean;
  onMediaReconnected?: (newStream: MediaStream) => void;
}

export default function SafeExamBrowser({
  children,
  maxWarnings = 3,
  onTerminate,
  onViolation,
  onFullscreenEntered,
  isEnabled = true,
  requireFullscreen = true,
  detectTabSwitch = true,
  blockCopyPaste = true,
  monitorViolations = true,
  autoSubmitOnViolation = true,
  activeMediaStream,
  requireCamera = false,
  requireMicrophone = false,
  isExamSubmitted = false,
  assessmentId,
  candidateId,
  candidateIdentifier,
  attestationSessionId,
  enableForensicWatermark = false,
  onMediaReconnected,
}: SafeExamBrowserProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const warningCountRef = useRef(0);
  const callbacksRef = useRef({
    onViolation,
    onTerminate,
    onFullscreenEntered,
    maxWarnings,
    autoSubmitOnViolation,
    onMediaReconnected,
  });
  callbacksRef.current = {
    onViolation,
    onTerminate,
    onFullscreenEntered,
    maxWarnings,
    autoSubmitOnViolation,
    onMediaReconnected,
  };

  // Media disconnect watchdog state
  const [isMediaDisconnected, setIsMediaDisconnected] = useState(false);
  const [disconnectedDeviceKind, setDisconnectedDeviceKind] = useState<'videoinput' | 'audioinput' | 'both' | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);
  const [isReconnectingMedia, setIsReconnectingMedia] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  const disconnectStartTimeRef = useRef<number | null>(null);
  const lastReportTimeRef = useRef<{ videoinput: number; audioinput: number }>({
    videoinput: 0,
    audioinput: 0,
  });

  // Keystroke cadence tracking refs (Section 6.5)
  const lastKeyUpTimeRef = useRef<number | null>(null);
  const keyDownTimestampsRef = useRef<Map<string, number>>(new Map());
  const flightIntervalsRef = useRef<number[]>([]);
  const dwellIntervalsRef = useRef<number[]>([]);
  const consecutivePrintableCountRef = useRef<number>(0);
  const lastMacroReportTimeRef = useRef<number>(0);
  const processedKeyEventsRef = useRef(new WeakSet<KeyboardEvent>());

  const triggerDisconnect = useCallback(
    (deviceKind: 'videoinput' | 'audioinput', reason: string, label?: string) => {
      if (isExamSubmitted) return;
      if (!disconnectStartTimeRef.current) {
        disconnectStartTimeRef.current = Date.now();
      }
      setIsMediaDisconnected(true);
      setDisconnectedDeviceKind((prev) => {
        if (!prev) return deviceKind;
        if (prev !== deviceKind) return 'both';
        return prev;
      });
      setDisconnectReason(reason);

      // Throttle reports to 1 per 15 seconds per deviceKind
      const now = Date.now();
      if (now - lastReportTimeRef.current[deviceKind] >= 15000) {
        lastReportTimeRef.current[deviceKind] = now;
        const msg = `Hardware Disconnected: ${deviceKind === 'videoinput' ? 'Camera' : 'Microphone'} was disabled or unplugged (${reason}).`;
        callbacksRef.current.onViolation?.('CAMERA_OR_MIC_DISCONNECTED', msg, {
          deviceKind,
          reason,
          deviceLabel: label || 'unknown',
        });
        if (assessmentId) {
          api.post('exam-security/violations', {
            assessmentId,
            eventType: 'CAMERA_OR_MIC_DISCONNECTED',
            message: msg,
            metadata: { deviceKind, reason, deviceLabel: label || 'unknown' },
          }).catch(() => {});
        }
      }
    },
    [isExamSubmitted, assessmentId]
  );

  const handleReconnectMedia = async () => {
    setIsReconnectingMedia(true);
    setReconnectError(null);
    try {
      const constraints: MediaStreamConstraints = {};
      if (requireCamera) constraints.video = true;
      if (requireMicrophone) constraints.audio = true;

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const hasLiveVideo = !requireCamera || newStream.getVideoTracks().some((t) => t.readyState === 'live');
      const hasLiveAudio = !requireMicrophone || newStream.getAudioTracks().some((t) => t.readyState === 'live');

      if (!hasLiveVideo || !hasLiveAudio) {
        throw new Error('Acquired stream has missing or inactive tracks');
      }

      const outageDurationMs = disconnectStartTimeRef.current
        ? Date.now() - disconnectStartTimeRef.current
        : 0;
      disconnectStartTimeRef.current = null;

      callbacksRef.current.onViolation?.(
        'CAMERA_OR_MIC_RESTORED',
        'Camera and microphone connection restored.',
        { outageDurationMs }
      );
      if (assessmentId) {
        api.post('exam-security/violations', {
          assessmentId,
          eventType: 'CAMERA_OR_MIC_RESTORED',
          message: 'Camera and microphone connection restored.',
          metadata: { outageDurationMs },
        }).catch(() => {});
      }

      callbacksRef.current.onMediaReconnected?.(newStream);
      setIsMediaDisconnected(false);
      setDisconnectedDeviceKind(null);
      setDisconnectReason(null);
      toast.success('Camera and microphone reconnected successfully.');
    } catch (err: any) {
      console.error('[SafeExamBrowser] Failed to reconnect media:', err);
      setReconnectError(
        err?.message || 'Could not access camera or microphone. Please check system permissions and device cables.'
      );
    } finally {
      setIsReconnectingMedia(false);
    }
  };

  // Mid-exam media track & device watchdog
  useEffect(() => {
    if (!isEnabled || isExamSubmitted || (!requireCamera && !requireMicrophone)) {
      return;
    }

    let muteTimerVideo: NodeJS.Timeout | null = null;
    let muteTimerAudio: NodeJS.Timeout | null = null;

    const cleanupTrackListeners: Array<() => void> = [];

    if (activeMediaStream) {
      if (requireCamera) {
        const videoTracks = activeMediaStream.getVideoTracks();
        if (videoTracks.length === 0 || videoTracks.every((t) => t.readyState === 'ended')) {
          triggerDisconnect('videoinput', 'ended');
        } else {
          videoTracks.forEach((track) => {
            const onEnded = () => triggerDisconnect('videoinput', 'ended', track.label);
            const onMute = () => {
              if (muteTimerVideo) clearTimeout(muteTimerVideo);
              muteTimerVideo = setTimeout(() => {
                if (track.muted) triggerDisconnect('videoinput', 'muted', track.label);
              }, 1500);
            };
            const onUnmute = () => {
              if (muteTimerVideo) {
                clearTimeout(muteTimerVideo);
                muteTimerVideo = null;
              }
            };

            track.addEventListener('ended', onEnded);
            track.addEventListener('mute', onMute);
            track.addEventListener('unmute', onUnmute);
            cleanupTrackListeners.push(() => {
              track.removeEventListener('ended', onEnded);
              track.removeEventListener('mute', onMute);
              track.removeEventListener('unmute', onUnmute);
            });
          });
        }
      }

      if (requireMicrophone) {
        const audioTracks = activeMediaStream.getAudioTracks();
        if (audioTracks.length === 0 || audioTracks.every((t) => t.readyState === 'ended')) {
          triggerDisconnect('audioinput', 'ended');
        } else {
          audioTracks.forEach((track) => {
            const onEnded = () => triggerDisconnect('audioinput', 'ended', track.label);
            const onMute = () => {
              if (muteTimerAudio) clearTimeout(muteTimerAudio);
              muteTimerAudio = setTimeout(() => {
                if (track.muted) triggerDisconnect('audioinput', 'muted', track.label);
              }, 1500);
            };
            const onUnmute = () => {
              if (muteTimerAudio) {
                clearTimeout(muteTimerAudio);
                muteTimerAudio = null;
              }
            };

            track.addEventListener('ended', onEnded);
            track.addEventListener('mute', onMute);
            track.addEventListener('unmute', onUnmute);
            cleanupTrackListeners.push(() => {
              track.removeEventListener('ended', onEnded);
              track.removeEventListener('mute', onMute);
              track.removeEventListener('unmute', onUnmute);
            });
          });
        }
      }
    }

    // Monitor hardware unplug / replug via devicechange
    const onDeviceChange = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (requireCamera) {
          const hasCamera = devices.some((d) => d.kind === 'videoinput');
          if (!hasCamera) triggerDisconnect('videoinput', 'device_unplugged');
        }
        if (requireMicrophone) {
          const hasMic = devices.some((d) => d.kind === 'audioinput');
          if (!hasMic) triggerDisconnect('audioinput', 'device_unplugged');
        }
      } catch (err) {
        console.warn('[SafeExamBrowser] devicechange check failed:', err);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }

    return () => {
      if (muteTimerVideo) clearTimeout(muteTimerVideo);
      if (muteTimerAudio) clearTimeout(muteTimerAudio);
      cleanupTrackListeners.forEach((fn) => fn());
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      }
    };
  }, [
    isEnabled,
    isExamSubmitted,
    requireCamera,
    requireMicrophone,
    activeMediaStream,
    triggerDisconnect,
  ]);

  useEffect(() => {
    if (isEnabled && (!requireFullscreen || isFullscreen)) {
      void callbacksRef.current.onFullscreenEntered?.();
    }
  }, [isEnabled, requireFullscreen, isFullscreen]);

  useEffect(() => {
    if (!isEnabled) return;
    let away = false;
    let engaged = !requireFullscreen || isDocumentFullscreen();
    const warnAway = (type: string, message: string) => {
      if (!monitorViolations || !engaged || away) return;
      away = true;
      handleWarning(type, message);
    };
    const checkReturned = () => {
      if (!document.hidden && document.hasFocus()) away = false;
    };

    // A route transition can preserve document fullscreen while this component
    // mounts with fresh local state. Sync immediately so the exam is not gated.
    const checkFullscreen = () => {
      const fullscreen = isDocumentFullscreen();
      setIsFullscreen(fullscreen);
      if (fullscreen) engaged = true;
      if (requireFullscreen && !fullscreen) {
        warnAway('fullscreen_exit', 'Exiting fullscreen is not allowed during the exam.');
      }
    };

    // Fullscreen event listener
    for (const event of fullscreenEvents) document.addEventListener(event, checkFullscreen);
    setIsFullscreen(isDocumentFullscreen());
    
    // Visibility change (tab switching)
    const handleVisibilityChange = () => {
      if (detectTabSwitch && document.hidden) {
        warnAway('tab_switch', 'Tab, desktop, or window switching is not allowed during the exam.');
      } else checkReturned();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const handleBlur = () => {
      if (detectTabSwitch) warnAway('tab_switch', 'The assessment lost focus. Switching apps, windows, or desktops is not allowed.');
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', checkReturned);
    // Some desktop transitions omit visibilitychange. Check focus as a fallback.
    const focusCheck = window.setInterval(() => {
      if (document.hidden || !document.hasFocus()) handleBlur();
      else checkReturned();
    }, 500);

    // Prevent Context Menu (Right Click)
    const handleContextMenu = (e: MouseEvent) => {
      if (blockCopyPaste) {
        e.preventDefault();
        e.stopPropagation();
        toast.error('Right-click is disabled during the assessment.');
      }
    };
    document.addEventListener('contextmenu', handleContextMenu, { capture: true });

    // Prevent drag and drop navigation
    const handleDrag = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragstart', handleDrag, { capture: true });
    document.addEventListener('drop', handleDrag, { capture: true });

    // Suppress window.print
    const origPrint = typeof window !== 'undefined' ? window.print : undefined;
    if (typeof window !== 'undefined') {
      window.print = () => {
        toast.error('Printing is disabled during the assessment.');
      };
    }

    // Intercept <input type="file"> clicks unless question explicitly permits
    const handleFileInputClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.matches?.('input[type="file"]') || target.closest?.('input[type="file"]'))) {
        const allowUpload =
          target.getAttribute('data-allow-file-upload') === 'true' ||
          target.closest?.('[data-allow-file-upload="true"]');
        if (!allowUpload) {
          e.preventDefault();
          e.stopPropagation();
          toast.error('File uploads are disabled for this question.');
        }
      }
    };
    document.addEventListener('click', handleFileInputClick, { capture: true });

    // Prevent copy, cut, paste outside allowed editor components
    const handleClipboardEvent = (e: ClipboardEvent) => {
      if (e.type === 'paste') {
        const pasteText = e.clipboardData?.getData('text') || '';
        pacingTelemetry.recordPaste(pasteText.length);
      }
      if (!blockCopyPaste) return;
      const target = e.target as HTMLElement | null;
      const isInsideEditor = target && (
        target.closest('.monaco-editor') ||
        target.closest('.scratchpad-editor') ||
        target.getAttribute('data-allow-local-clipboard') === 'true'
      );
      if (!isInsideEditor) {
        e.preventDefault();
        e.stopPropagation();
        toast.error('Clipboard actions are disabled outside the code editor.');
      }
    };
    document.addEventListener('copy', handleClipboardEvent, { capture: true });
    document.addEventListener('cut', handleClipboardEvent, { capture: true });
    document.addEventListener('paste', handleClipboardEvent, { capture: true });

    // Prevent specific keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (processedKeyEventsRef.current.has(e)) return;
      processedKeyEventsRef.current.add(e);

      pacingTelemetry.recordKeystroke();
      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const keyLower = (e.key || '').toLowerCase();
      const code = e.keyCode || e.which;

      // 0. Block Escape (MUST NOT leave fullscreen or dismiss window)
      if (e.key === 'Escape' || code === 27) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 0.1 Block PrintScreen
      if (e.key === 'PrintScreen' || code === 44) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 0.2 Block Function Keys F1 - F12
      if ((code >= 112 && code <= 123) || /^F(1[0-2]|[1-9])$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 1. Block Application & Tab Switching (Cmd+Tab, Ctrl+Tab, Alt+Tab, Alt+Esc)
      if ((e.key === 'Tab' || code === 9) && (cmdOrCtrl || e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        toast.error('Application and tab switching is disabled during the exam.');
        return;
      }
      if (e.altKey && (e.key === 'Escape' || code === 27 || e.key === 'F4' || code === 115)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 2. Block Window / Tab / Browser Navigation (Cmd/Ctrl + W, T, N, Q, R, H, M, L, S, O, U, P, I, J)
      if (
        cmdOrCtrl &&
        (keyLower === 'w' ||
          keyLower === 't' ||
          keyLower === 'n' ||
          keyLower === 'q' ||
          keyLower === 'r' ||
          keyLower === 'h' ||
          keyLower === 'm' ||
          keyLower === 'l' ||
          keyLower === 's' ||
          keyLower === 'o' ||
          keyLower === 'u' ||
          keyLower === 'p' ||
          keyLower === 'i' ||
          keyLower === 'j')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 3. Block Tab cycling & window switching (Cmd/Ctrl + [, ], `, ~)
      if (cmdOrCtrl && (e.key === '[' || e.key === ']' || e.key === '`' || e.key === '~')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 4. Block Mission Control / Spaces switching (Ctrl + Arrow keys)
      if (
        e.ctrlKey &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Check editor allowlist for copy/cut/paste shortcuts
      const target = e.target as HTMLElement | null;
      const isInsideEditor = target && (
        target.closest('.monaco-editor') ||
        target.closest('.scratchpad-editor') ||
        target.getAttribute('data-allow-local-clipboard') === 'true'
      );

      // 6. Block Copy / Paste / Cut outside editor
      if (blockCopyPaste && cmdOrCtrl && (keyLower === 'c' || keyLower === 'v' || keyLower === 'x')) {
        if (!isInsideEditor) {
          e.preventDefault();
          e.stopPropagation();
          toast.error('Copy/Paste is disabled outside the code editor.');
          return;
        }
      }

      // 7. Track Keystroke Cadence for HID Macro / Keystroke Injection Detection (Section 6.5)
      const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isTypingField = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as HTMLElement).isContentEditable ||
        target.closest('.monaco-editor') ||
        target.closest('.scratchpad-editor') ||
        target.getAttribute('data-allow-local-clipboard') === 'true'
      );

      if (isPrintable && isTypingField && monitorViolations && !isExamSubmitted) {
        const now = performance.now();
        keyDownTimestampsRef.current.set(e.code, now);

        const lastKeyUp = lastKeyUpTimeRef.current;
        if (lastKeyUp !== null) {
          const flight = now - lastKeyUp;
          // Valid flight time between consecutive keystrokes (< 2000ms)
          if (flight >= 0 && flight < 2000) {
            consecutivePrintableCountRef.current += 1;
            const flights = flightIntervalsRef.current;
            flights.push(flight);
            if (flights.length > 50) {
              flights.shift();
            }

            // Trigger detection if candidate typed >= 60 characters with sufficient sample size
            if (consecutivePrintableCountRef.current >= 60 && flights.length >= 30) {
              const sum = flights.reduce((a, b) => a + b, 0);
              const meanFlightMs = sum / flights.length;
              const variance = flights.reduce((a, b) => a + Math.pow(b - meanFlightMs, 2), 0) / flights.length;
              const stdDevMs = Math.sqrt(variance);

              // Superhuman robotic cadence criteria: mean flight < 18ms and stdDev < 3.5ms
              if (meanFlightMs < 18 && stdDevMs < 3.5) {
                const nowWallMs = Date.now();
                if (nowWallMs - lastMacroReportTimeRef.current > 10000) {
                  lastMacroReportTimeRef.current = nowWallMs;
                  const charsPerMinute = Math.round(60000 / Math.max(meanFlightMs, 1));
                  callbacksRef.current.onViolation?.(
                    'HID_MACRO_INJECTION_SUSPECTED',
                    'Superhuman keystroke injection cadence detected from input device',
                    {
                      sampleSize: flights.length,
                      consecutiveCharacters: consecutivePrintableCountRef.current,
                      meanFlightMs: Math.round(meanFlightMs * 100) / 100,
                      stdDevMs: Math.round(stdDevMs * 100) / 100,
                      charsPerMinute,
                    }
                  );
                }
              }
            }
          } else {
            // Typing pause exceeded 2000ms: reset burst counter
            consecutivePrintableCountRef.current = 1;
            flightIntervalsRef.current = [];
          }
        } else {
          consecutivePrintableCountRef.current = 1;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (processedKeyEventsRef.current.has(e)) return;
      processedKeyEventsRef.current.add(e);

      const target = e.target as HTMLElement | null;
      const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isTypingField = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as HTMLElement).isContentEditable ||
        target.closest('.monaco-editor') ||
        target.closest('.scratchpad-editor') ||
        target.getAttribute('data-allow-local-clipboard') === 'true'
      );

      if (isPrintable && isTypingField && monitorViolations && !isExamSubmitted) {
        const now = performance.now();
        const start = keyDownTimestampsRef.current.get(e.code);
        if (start !== undefined) {
          const dwell = now - start;
          const dwells = dwellIntervalsRef.current;
          dwells.push(dwell);
          if (dwells.length > 50) {
            dwells.shift();
          }
          keyDownTimestampsRef.current.delete(e.code);
        }
        lastKeyUpTimeRef.current = now;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    // We don't want to show a warning on initial mount if they are just arriving,
    // but the fullscreenchange will handle actual exits.

    return () => {
      for (const event of fullscreenEvents) document.removeEventListener(event, checkFullscreen);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', checkReturned);
      window.clearInterval(focusCheck);
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true } as any);
      document.removeEventListener('dragstart', handleDrag, { capture: true } as any);
      document.removeEventListener('drop', handleDrag, { capture: true } as any);
      document.removeEventListener('copy', handleClipboardEvent, { capture: true } as any);
      document.removeEventListener('cut', handleClipboardEvent, { capture: true } as any);
      document.removeEventListener('paste', handleClipboardEvent, { capture: true } as any);
      document.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
      document.removeEventListener('keyup', handleKeyUp, { capture: true } as any);
      window.removeEventListener('keyup', handleKeyUp, { capture: true } as any);
      document.removeEventListener('click', handleFileInputClick, { capture: true } as any);
      if (origPrint && typeof window !== 'undefined') {
        window.print = origPrint;
      }
    };
  }, [isEnabled, requireFullscreen, detectTabSwitch, blockCopyPaste, monitorViolations]);

  const handleWarning = (type: string, message: string) => {
    const callbacks = callbacksRef.current;
    if (callbacks.autoSubmitOnViolation && warningCountRef.current >= callbacks.maxWarnings) return;
    callbacks.onViolation?.(type, message);
    const nextCount = ++warningCountRef.current;
    setWarnings(nextCount);
    if (callbacks.autoSubmitOnViolation && nextCount >= callbacks.maxWarnings) {
      toast.error('Maximum warnings exceeded. Exam terminated.');
      callbacks.onTerminate?.();
    } else if (callbacks.autoSubmitOnViolation) {
      toast.error(`Warning ${nextCount}/${callbacks.maxWarnings}: ${message}`);
    } else {
      // In manual submission mode, continuous violations are tracked with penalty feedback
      toast.error(`Violation recorded (#${nextCount}): ${message}`);
    }
  };

  const requestFullscreen = async () => {
    try {
      await enterDocumentFullscreen();
      // The effect calls the start callback once fullscreen state is confirmed.
      setIsFullscreen(isDocumentFullscreen());
    } catch (err) {
      console.error("Error attempting to enable fullscreen:", err);
      setIsFullscreen(isDocumentFullscreen());
      toast.error("Failed to enter fullscreen. Please try again.");
    }
  };

  if (!isEnabled) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-background">
      {/* Forensic Screen Watermarking Overlay (conditional, default false) */}
      <ForensicWatermarkOverlay
        enabled={enableForensicWatermark && !isExamSubmitted}
        isSubmitted={isExamSubmitted}
        candidateId={candidateId}
        candidateIdentifier={candidateIdentifier}
        assessmentId={assessmentId}
        attestationSessionId={attestationSessionId}
        onTamper={(reason, details) => {
          callbacksRef.current.onViolation?.(
            'WATERMARK_TAMPER_ATTEMPT',
            'Forensic screen watermark tampering attempt detected',
            details
          );
        }}
      />

      {/* The actual content */}
      <div inert={requireFullscreen && !isFullscreen} aria-hidden={requireFullscreen && !isFullscreen} className={`w-full h-full overflow-hidden transition-opacity duration-300 ${requireFullscreen && !isFullscreen ? 'opacity-0 pointer-events-none blur-sm' : 'opacity-100'}`}>
        {children}
      </div>

      {/* Fullscreen Overlay */}
      <AnimatePresence>
        {requireFullscreen && !isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[9999] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <ShieldAlert className="w-20 h-20 text-red-500 mb-6" />
            <h1 className="text-3xl font-bold text-foreground mb-4">Secure Exam Environment</h1>
            <p className="text-muted-foreground text-lg max-w-lg mb-8">
              Enter fullscreen to begin your assessment. {monitorViolations ? 'Leaving fullscreen during the test will be recorded.' : 'The timer starts after you enter fullscreen.'}
            </p>
            
            {warnings > 0 && (
              <div className="flex items-center gap-2 text-yellow-500 bg-yellow-500/10 px-4 py-2 rounded-lg mb-8 border border-yellow-500/20">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">You have {warnings} out of {maxWarnings} warnings.</span>
              </div>
            )}

            <button
              onClick={requestFullscreen}
              className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/25"
            >
              <Maximize className="w-5 h-5" />
              Enter Fullscreen to Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hardware Disconnected Non-Dismissible Modal */}
      <AnimatePresence>
        {isMediaDisconnected && !isExamSubmitted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                {disconnectedDeviceKind === 'audioinput' ? (
                  <MicOff className="w-8 h-8" />
                ) : (
                  <VideoOff className="w-8 h-8" />
                )}
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Hardware Disconnected
                </h2>
                <p className="text-sm text-slate-400">
                  Your {disconnectedDeviceKind === 'both' ? 'camera and microphone were' : disconnectedDeviceKind === 'audioinput' ? 'microphone was' : 'camera was'} disconnected or muted. Continuous proctoring is mandatory during the assessment.
                </p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-red-400 font-semibold uppercase">{disconnectReason || 'Disconnected'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Impacted Device:</span>
                  <span className="text-white font-medium capitalize">
                    {disconnectedDeviceKind === 'both' ? 'Camera & Microphone' : disconnectedDeviceKind === 'audioinput' ? 'Microphone' : 'Camera'}
                  </span>
                </div>
              </div>

              {reconnectError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-left">
                  {reconnectError}
                </div>
              )}

              <button
                type="button"
                onClick={handleReconnectMedia}
                disabled={isReconnectingMedia}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-all shadow-lg shadow-red-600/20 disabled:opacity-50 cursor-pointer"
              >
                {isReconnectingMedia ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reconnecting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-verify Camera &amp; Microphone
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
