"use client";

import { useEffect, useCallback } from "react";

/**
 * Hook to provide standard accessibility behaviors for modal dialogs (AUD-UI-006):
 * - Listens for 'Escape' key presses to dismiss the dialog
 * - Prevents background scroll while the modal is open
 */
export function useModalAccessibility(isOpen: boolean, onClose?: () => void) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, handleKeyDown]);
}
