'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorFallback } from '@/components/errors/ErrorFallback';
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
      return <ErrorFallback reset={() => window.location.reload()} reloadOnRetry />;
    }
    return this.props.children;
  }
}
