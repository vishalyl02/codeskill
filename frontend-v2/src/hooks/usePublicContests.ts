"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/config/api";
import { parseContests, type PublicContest } from "@/lib/contests";
import { useAuth } from "@/context/AuthContext";

export function usePublicContests() {
  const { user, loading: authLoading } = useAuth();
  const [contests, setContests] = useState<PublicContest[]>([]);
  const [privateContests, setPrivateContests] = useState<PublicContest[]>([]);
  const [loading, setLoading] = useState(true);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const publicRequest = useRef<AbortController | null>(null);
  const privateRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    publicRequest.current?.abort();
    privateRequest.current?.abort();
    const publicController = new AbortController();
    publicRequest.current = publicController;
    const publicLoad = api.get("/contests", { signal: publicController.signal }).then(response => {
      if (!publicController.signal.aborted) { setContests(parseContests(response.data)); setError(null); }
    }).catch(() => {
      if (!publicController.signal.aborted) setError("Contests could not be loaded. Please try again.");
    }).finally(() => {
      if (!publicController.signal.aborted) setLoading(false);
    });

    if (authLoading || !user) {
      setPrivateContests([]); setPrivateError(null); setPrivateLoading(false);
      return publicLoad;
    }

    const privateController = new AbortController();
    privateRequest.current = privateController;
    setPrivateLoading(true);
    const privateLoad = api.get("/contests/private", { signal: privateController.signal }).then(response => {
      if (!privateController.signal.aborted) { setPrivateContests(parseContests(response.data)); setPrivateError(null); }
    }).catch(() => {
      if (!privateController.signal.aborted) setPrivateError("Private contests could not be loaded. Please try again.");
    }).finally(() => {
      if (!privateController.signal.aborted) setPrivateLoading(false);
    });
    return Promise.all([publicLoad, privateLoad]);
  }, [user, authLoading]);
  useEffect(() => {
    void refresh();
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("codeskill-contests-changed", refreshVisible);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("codeskill-contests") : null;
    if (channel) channel.onmessage = refreshVisible;
    return () => {
      clearInterval(timer); window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible); window.removeEventListener("codeskill-contests-changed", refreshVisible); channel?.close(); publicRequest.current?.abort(); privateRequest.current?.abort();
    };
  }, [refresh]);
  return { contests, privateContests, loading, privateLoading, error, privateError, refresh, authLoading, isAuthenticated: !!user };
}
