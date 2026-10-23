'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { initClientTracePropagation } from './trace-fetch';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class TelemetryBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  componentDidMount(): void {
    initClientTracePropagation();
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleWindowError = (event: ErrorEvent): void => {
    this.shipTelemetry({
      type: 'window_error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.shipTelemetry({
      type: 'unhandled_promise_rejection',
      message: String(event.reason?.message || event.reason || 'Unknown rejection'),
    });
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.shipTelemetry({
      type: 'react_error_boundary',
      name: error.name,
      message: error.message,
      componentStack: errorInfo.componentStack?.slice(0, 1000),
    });
  }

  private shipTelemetry(payload: Record<string, unknown>): void {
    try {
      const body = JSON.stringify({
        ...payload,
        url: window.location.href,
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/telemetry/client-events', blob);
      }
    } catch {
      // Never throw inside telemetry reporter
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-semibold">Temporary UI Glitch Detected</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your exam progress and code drafts are safe. Click below to reload the workspace.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
          >
            Reload Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
