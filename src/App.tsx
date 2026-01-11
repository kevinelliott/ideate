import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";

function App() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const handleNewProject = () => {
    setShowNewProjectModal(true);
    console.log("New project modal:", showNewProjectModal);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar onNewProject={handleNewProject} />
      <MainContent />
    </div>
  );
}

export default App;
