"use client";
import { useEffect, useState } from "react";
import { runAPI } from "@/config/api";
export function useExecutionRuntimes() {
  const [runtimes, setRuntimes] = useState<
    Array<{ language: string; version?: string; enabled: boolean }>
  >([]);
  useEffect(() => {
    let active = true;
    runAPI
      .runtimes()
      .then((response) => {
        if (active) setRuntimes(response.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return runtimes;
}
