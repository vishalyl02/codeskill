import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ResizableAssessmentPanels } from "@/components/assessment/ResizableAssessmentPanels";
import { FloatingAssessmentMonitor } from "@/components/assessment/FloatingAssessmentMonitor";

function pointer(element: HTMLElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(element, event);
}
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.hasPointerCapture = jest.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

it("resizes the split panels by dragging and keyboard, clamps extremes, and resets", () => {
  const { container } = render(<ResizableAssessmentPanels><section>Statement</section><section>Options</section></ResizableAssessmentPanels>);
  const divider = screen.getByRole("separator", { name: "Resize statement and answer panels" });
  jest.spyOn(container.firstElementChild!, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 600 } as DOMRect);
  pointer(divider, "pointerdown", 500, 50); pointer(divider, "pointermove", 650, 50); pointer(divider, "pointerup", 650, 50);
  expect(divider).toHaveAttribute("aria-valuenow", "65");
  fireEvent.keyDown(divider, { key: "End" }); expect(divider).toHaveAttribute("aria-valuenow", "75");
  fireEvent.keyDown(divider, { key: "ArrowRight" }); expect(divider).toHaveAttribute("aria-valuenow", "75");
  fireEvent.keyDown(divider, { key: "Home" }); expect(divider).toHaveAttribute("aria-valuenow", "25");
  fireEvent.doubleClick(divider); expect(divider).toHaveAttribute("aria-valuenow", "50");
});

it("moves and resizes the whole monitor without replacing the video and can reset it", () => {
  render(<FloatingAssessmentMonitor><video data-testid="feed" /></FloatingAssessmentMonitor>);
  const frame = screen.getByLabelText("Movable camera monitor");
  const video = screen.getByTestId("feed");
  const drag = screen.getByRole("button", { name: "Move camera monitor" });
  jest.spyOn(frame, "getBoundingClientRect").mockReturnValue({ left: 12, top: 468, width: 280, height: 420 } as DOMRect);
  pointer(drag, "pointerdown", 30, 480); pointer(drag, "pointermove", 130, 380); pointer(drag, "pointerup", 130, 380);
  expect(frame).toHaveStyle({ left: "112px", top: "368px" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Resize camera monitor" }), { key: "ArrowRight" });
  expect(frame).toHaveStyle({ width: "292px" });
  expect(screen.getByTestId("feed")).toBe(video);
  fireEvent.click(screen.getByRole("button", { name: "Reset camera position and size" }));
  expect(frame).toHaveStyle({ left: "12px", top: "468px", width: "280px", height: "420px" });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  fireEvent(window, new Event("resize"));
  expect(parseFloat(frame.style.left)).toBeLessThanOrEqual(224);
  expect(parseFloat(frame.style.top)).toBeLessThanOrEqual(464);
});

it("lets the camera handle reach the top and bottom of the screen regardless of panel height", () => {
  render(<FloatingAssessmentMonitor><video /></FloatingAssessmentMonitor>);
  const frame = screen.getByLabelText("Movable camera monitor");
  const drag = screen.getByRole("button", { name: "Move camera monitor" });
  jest.spyOn(frame, "getBoundingClientRect").mockReturnValue({ left: 12, top: 468, width: 280, height: 420 } as DOMRect);
  pointer(drag, "pointerdown", 20, 480); pointer(drag, "pointermove", 1150, 850); pointer(drag, "pointerup", 1150, 850);
  expect(parseFloat(frame.style.top)).toBeGreaterThan(900 - 420);
  expect(parseFloat(frame.style.top)).toBeLessThanOrEqual(864);
  pointer(drag, "pointerdown", 20, 480); pointer(drag, "pointermove", 20, -500); pointer(drag, "pointerup", 20, -500);
  expect(frame).toHaveStyle({ top: "0px" });
  fireEvent.keyDown(drag, { key: "Home" });
  expect(frame).toHaveStyle({ left: "12px", top: "468px" });
});
