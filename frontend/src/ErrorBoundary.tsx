import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(8,12,24,0.95)",
            color: "#e8ecff",
            padding: 32,
            zIndex: 9999,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div
            style={{ fontSize: 16, color: "#ff5a6e", marginBottom: 8 }}
          >
            Rendering Error
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#5a6a8f",
              marginBottom: 24,
              maxWidth: 480,
              textAlign: "center",
            }}
          >
            {this.state.error?.message ?? "An unexpected error occurred."}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              background: "#ffe14d",
              color: "#05070d",
              border: "none",
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
