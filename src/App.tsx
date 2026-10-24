import { useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ProjectProvider, useProject } from "./contexts/ProjectContext";
import { DocumentProvider } from "./contexts/DocumentContext";
import { MainLayout } from "./components/Layout/MainLayout";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { ProjectLauncherPage } from "./pages/ProjectLauncherPage";
import "./styles/theme.css";
import "./App.css";

function AppContent() {
  const { projectPath } = useProject();
  // プロジェクトが開かれていない場合はランチャーを表示
  const [showLauncher, setShowLauncher] = useState<boolean>(!projectPath);

  if (showLauncher) {
    return (
      <ProjectLauncherPage
        onNavigateToEditor={() => setShowLauncher(false)}
      />
    );
  }

  return (
    <MainLayout onOpenLauncher={() => setShowLauncher(true)} />
  );
}

function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ProjectProvider>
          <DocumentProvider>
            <AppContent />
            <SettingsModal />
          </DocumentProvider>
        </ProjectProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
