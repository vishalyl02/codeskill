import { renderHook, act } from "@testing-library/react";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

describe("useModalAccessibility (AUD-UI-006)", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("calls onClose when Escape key is pressed while open", () => {
    const onClose = jest.fn();
    renderHook(() => useModalAccessibility(true, onClose));

    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when Escape key is pressed while closed", () => {
    const onClose = jest.fn();
    renderHook(() => useModalAccessibility(false, onClose));

    expect(document.body.style.overflow).not.toBe("hidden");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores body overflow when unmounted", () => {
    const { unmount } = renderHook(() => useModalAccessibility(true, jest.fn()));
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
