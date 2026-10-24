import { useState } from "react";
import { ThemeProvider, useTheme, type Theme } from "./contexts/ThemeContext";
import { SettingsProvider, SettingsModal } from "restar-app-settings";
import "restar-app-settings/styles.css";
import "./core/settingsRegistry";
import { ProjectProvider, useProject } from "./contexts/ProjectContext";
import { GitProvider } from "./contexts/GitContext";
import { DocumentProvider } from "./contexts/DocumentContext";
import { AIContextProvider } from "tauri-plugin-novelaid-ai-api";
import "tauri-plugin-novelaid-ai-api/styles.css";
import { MainLayout } from "./components/Layout/MainLayout";
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

function SettingsBoundApp() {
  const { setTheme } = useTheme();

  return (
    <SettingsProvider
      onSettingChange={(key, value) => {
        if (key === "theme") {
          setTheme(value as Theme);
        }
      }}
    >
      <ProjectProvider>
        <GitProvider>
          <DocumentProvider>
            <AIContextProvider>
              <AppContent />
              <SettingsModal />
            </AIContextProvider>
          </DocumentProvider>
        </GitProvider>
      </ProjectProvider>
    </SettingsProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <SettingsBoundApp />
    </ThemeProvider>
  );
}

export default App;
