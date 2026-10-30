import { useState, useEffect } from "react";
import { ThemeProvider, useTheme, type Theme } from "./contexts/ThemeContext";
import { SettingsProvider, SettingsModal } from "restar-app-settings";
import "restar-app-settings/styles.css";
import "./core/settingsRegistry";
import { NotificationProvider } from "./contexts/NotificationContext";
import { ToastContainer } from "./components/Notification/ToastContainer";
import { ProjectProvider, useProject } from "./contexts/ProjectContext";
import { GitProvider } from "./contexts/GitContext";
import { DocumentProvider } from "./contexts/DocumentContext";
import { MainLayout } from "./components/Layout/MainLayout";
import { ProjectLauncherPage } from "./pages/ProjectLauncherPage";
import { bootLog } from "./utils/bootLogger";
import "./styles/theme.css";
import "./App.css";

function AppContent() {
  const { projectPath } = useProject();
  // プロジェクトが開かれていない場合はランチャーを表示
  const [showLauncher, setShowLauncher] = useState<boolean>(!projectPath);

  useEffect(() => {
    bootLog(`AppContent mounted. Target view: ${showLauncher ? "ProjectLauncher" : "MainLayout"}`, { projectPath });
  }, [showLauncher, projectPath]);

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

  useEffect(() => {
    bootLog("SettingsBoundApp mounted");
  }, []);

  return (
    <SettingsProvider
      onSettingChange={(key, value) => {
        bootLog(`Setting changed: ${key} = ${value}`);
        if (key === "theme") {
          setTheme(value as Theme);
        }
      }}
    >
      <NotificationProvider>
        <ProjectProvider>
          <GitProvider>
            <DocumentProvider>
              <AppContent />
              <SettingsModal />
              <ToastContainer />
            </DocumentProvider>
          </GitProvider>
        </ProjectProvider>
      </NotificationProvider>
    </SettingsProvider>
  );
}

function App() {
  useEffect(() => {
    bootLog("App root mounted");
  }, []);

  return (
    <ThemeProvider>
      <SettingsBoundApp />
    </ThemeProvider>
  );
}

export default App;
