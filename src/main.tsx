import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ProcessViewerWindow } from "./windows/ProcessViewerWindow";
import { StoryManagerWindow } from "./windows/StoryManagerWindow";
import "./index.css";

// Import prdStore early to ensure event listeners are registered for cross-window communication
// This must run in all windows so the main window can handle requests from Story Manager
import "./stores/prdStore";

// Debug: log which window is loading
console.log('[main.tsx] Window loading, pathname:', window.location.pathname, 'search:', window.location.search);

function Root() {
  const path = window.location.pathname;
  
  if (path === "/process-viewer") {
    return <ProcessViewerWindow />;
  }
  
  if (path === "/story-manager") {
    return <StoryManagerWindow />;
  }
  
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
