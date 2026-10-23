import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { m, MOTION_TRANSITIONS, motionFadeIn, motionScaleUp } from "@/lib/motion";

describe("MotionProvider & motion utilities", () => {
  it("renders children successfully within MotionProvider", () => {
    render(
      <MotionProvider>
        <div data-testid="child-element">CodeSkill Motion</div>
      </MotionProvider>
    );

    expect(screen.getByTestId("child-element")).toBeInTheDocument();
    expect(screen.getByText("CodeSkill Motion")).toBeInTheDocument();
  });

  it("renders lightweight m elements inside MotionProvider with LazyMotion", () => {
    render(
      <MotionProvider reducedMotion="always">
        <m.button data-testid="motion-button">
          Accessible Button
        </m.button>
      </MotionProvider>
    );

    const button = screen.getByTestId("motion-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Accessible Button");
  });

  it("exports valid motion transition and variant presets", () => {
    expect(MOTION_TRANSITIONS.snappy.type).toBe("spring");
    expect(MOTION_TRANSITIONS.smooth.damping).toBe(25);
    expect(motionFadeIn.hidden.opacity).toBe(0);
    expect(motionFadeIn.visible.opacity).toBe(1);
    expect(motionScaleUp.hidden.scale).toBe(0.95);
    expect(motionScaleUp.visible.scale).toBe(1);
  });
});
