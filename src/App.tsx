import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { NewProjectModal } from "./components/NewProjectModal";

function App() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const handleNewProject = () => {
    setShowNewProjectModal(true);
  };

  const handleCloseModal = () => {
    setShowNewProjectModal(false);
  };

  const handleCreateProject = (name: string, description: string, directory: string | null) => {
    console.log("Create project:", { name, description, directory });
    setShowNewProjectModal(false);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar onNewProject={handleNewProject} />
      <MainContent />
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={handleCloseModal}
        onCreate={handleCreateProject}
      />
    </div>
  );
}

export default App;
