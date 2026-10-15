import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssessmentReadingZoom } from "@/components/assessment/AssessmentReadingZoom";

it("magnifies with trackpad pinch events, leaves ordinary scrolling alone, and resets", () => {
  render(<AssessmentReadingZoom>{scale => <p data-testid="question" style={{ zoom: scale }}>Question content</p>}</AssessmentReadingZoom>);
  const question = screen.getByTestId("question");
  const scroll = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
  fireEvent(question, scroll);
  expect(scroll.defaultPrevented).toBe(false);
  expect(screen.getByRole("button", { name: "Reset question zoom" })).toHaveTextContent("100%");
  const pinch = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -50 });
  fireEvent(question, pinch);
  expect(pinch.defaultPrevented).toBe(true);
  expect(Number(question.style.zoom)).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("button", { name: "Reset question zoom" }));
  expect(question.style.zoom).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in question" }));
  expect(screen.getByRole("button", { name: "Reset question zoom" })).toHaveTextContent("110%");
});

it("supports two-finger touch pinch and Safari gesture events within 80–200%", () => {
  render(<AssessmentReadingZoom>{scale => <p data-testid="question" style={{ zoom: scale }}>Question</p>}</AssessmentReadingZoom>);
  const question = screen.getByTestId("question");
  fireEvent.touchStart(question, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }] });
  fireEvent.touchMove(question, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 150, clientY: 0 }] });
  expect(screen.getByRole("button", { name: "Reset question zoom" })).toHaveTextContent("150%");
  fireEvent.touchEnd(question);
  fireEvent(question, new Event("gesturestart", { bubbles: true, cancelable: true }));
  const change = new Event("gesturechange", { bubbles: true, cancelable: true });
  Object.defineProperty(change, "scale", { value: 3 }); fireEvent(question, change);
  expect(screen.getByRole("button", { name: "Reset question zoom" })).toHaveTextContent("200%");
  expect(screen.getByRole("button", { name: "Zoom in question" })).toBeDisabled();
  fireEvent.wheel(question, { ctrlKey: true, deltaY: 1000 });
  expect(screen.getByRole("button", { name: "Reset question zoom" })).toHaveTextContent("80%");
  expect(screen.getByRole("button", { name: "Zoom out question" })).toBeDisabled();
});
