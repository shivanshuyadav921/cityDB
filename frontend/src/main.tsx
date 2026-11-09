import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { AuthProvider } from "./AuthContext.tsx";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found. Check index.html.");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
