import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ProcessViewerWindow } from "./windows/ProcessViewerWindow";
import { StoryManagerWindow } from "./windows/StoryManagerWindow";
import "./index.css";

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
