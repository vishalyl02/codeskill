"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, Play, Pause, RotateCcw } from "lucide-react";
import styles from "./WorkspaceEnhancements.module.css";

export function WorkspaceTimer() {
  const [visible, setVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const accumulated = useRef(0);
  useEffect(() => {
    if (!running) return;
    const update = () => setElapsed(Math.floor((accumulated.current + Date.now() - startedAt.current) / 1000));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [running]);
  const start = () => { startedAt.current = Date.now(); setRunning(true); };
  const toggleRunning = () => {
    if (running) { accumulated.current += Date.now() - startedAt.current; setRunning(false); }
    else start();
  };
  const formatted = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(value => String(value).padStart(2, "0")).join(":");
  return <div className={styles.compactTimer}>
    <button type="button" aria-label={visible ? "Hide timer" : "Show timer"} aria-expanded={visible} title={visible ? "Hide timer" : "Show timer"} onClick={() => { if (!visible && !running && elapsed === 0) start(); setVisible(open => !open); }}><Timer size={16} /></button>
    {visible && <><span aria-label={`Elapsed time ${formatted}`}>{formatted}</span><button type="button" onClick={toggleRunning} aria-label={running ? "Pause timer" : "Start timer"}>{running ? <Pause size={13} /> : <Play size={13} />}</button><button type="button" aria-label="Reset timer" onClick={() => { accumulated.current = 0; startedAt.current = Date.now(); setElapsed(0); setRunning(false); }}><RotateCcw size={13} /></button></>}
  </div>;
}
