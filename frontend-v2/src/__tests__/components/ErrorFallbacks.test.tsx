import { act, fireEvent, render, screen } from "@testing-library/react";
import RootError from "@/app/error";
import NotFound from "@/app/not-found";
import { ErrorFallback } from "@/components/errors/ErrorFallback";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

describe("route fallback screens", () => {
  it("renders a safe error message, retries the segment and links home", () => {
    const reset = jest.fn();
    render(<RootError error={new Error("sensitive internal detail")} reset={reset} />);

    expect(screen.getByText(/We hit an unexpected issue while loading this page/)).toBeTruthy();
    expect(screen.queryByText("sensitive internal detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Back to Home/ }).getAttribute("href")).toBe("/");
  });

  it("shows a loading state and refreshes when retry is requested", () => {
    jest.useFakeTimers();
    const reset = jest.fn();
    render(<ErrorFallback reset={reset} kind="server" />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Trying again…")).toBeTruthy();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled")).toBe(true);
    try {
      act(() => jest.advanceTimersByTime(900));
    } finally {
      jest.useRealTimers();
    }
  });

  it("renders the network-specific recovery message", () => {
    render(<ErrorFallback reset={jest.fn()} kind="network" />);
    expect(screen.getByRole("heading", { name: "You’re offline or disconnected" })).toBeTruthy();
    expect(screen.getByText("We couldn’t connect to the server. Check your connection and try again.")).toBeTruthy();
  });

  it("shows an unknown-route page with a home action", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Looks like a wrong turn" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to Home/ }).getAttribute("href")).toBe("/");
  });
});
