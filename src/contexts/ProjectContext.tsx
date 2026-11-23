import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import type { ProjectItem } from "restar-app";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { bootLog } from "../utils/bootLogger";

interface ProjectContextType {
  projectPath: string | null;
  projectName: string | null;
  appVersion: string;
  recentProjects: ProjectItem[];
  openProject: (path: string, name?: string) => Promise<void>;
  closeProject: () => Promise<void>;
  registerCloseHandler: (handler: (() => Promise<void> | void) | null) => void;
  removeRecentProject: (path: string) => Promise<void>;
  addRecentProject: (name: string, path: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const RECENT_PROJECTS_KEY = "novelaide-recent-projects";
const CURRENT_PROJECT_KEY = "novelaide-current-project";

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [projectPath, setProjectPath] = useState<string | null>(() => {
    const val = localStorage.getItem(CURRENT_PROJECT_KEY);
    bootLog("ProjectProvider initial projectPath from localStorage:", val);
    return val;
  });

  const [projectName, setProjectName] = useState<string | null>(() => {
    const saved = localStorage.getItem(CURRENT_PROJECT_KEY);
    if (!saved) return null;
    const parts = saved.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "Untitled";
  });

  const [recentProjects, setRecentProjects] = useState<ProjectItem[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_PROJECTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appVersion, setAppVersion] = useState<string>("");
  const closeHandlerRef = useRef<(() => Promise<void> | void) | null>(null);

  const registerCloseHandler = useCallback((handler: (() => Promise<void> | void) | null) => {
    closeHandlerRef.current = handler;
  }, []);

  const updateTitle = useCallback(async (pName: string | null, version: string) => {
    const base = "novelaide";
    const versionStr = version ? ` v${version}` : "";
    const projectStr = pName ? ` - ${pName}` : "";
    const title = `${base}${versionStr}${projectStr}`;

    document.title = title;
    try {
      await getCurrentWindow().setTitle(title);
      bootLog("Window title updated:", title);
    } catch (error) {
      console.warn("Failed to set window title via Tauri API:", error);
    }
  }, []);

  // 起動時にバージョンを取得してタイトルに反映
  useEffect(() => {
    const initVersion = async () => {
      try {
        const ver = await getVersion();
        setAppVersion(ver);
        updateTitle(projectName, ver);
      } catch (error) {
        console.warn("Failed to get app version from Tauri API:", error);
      }
    };
    initVersion();
  }, []);

  // projectName または appVersion の変更時にタイトルを再計算
  useEffect(() => {
    if (appVersion) {
      updateTitle(projectName, appVersion);
    }
  }, [projectName, appVersion, updateTitle]);

  useEffect(() => {
    bootLog("ProjectProvider mounted", { projectPath, projectName });
  }, []);

  // 最近のプロジェクト追加
  const addRecentProject = async (name: string, path: string) => {
    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.path !== path);
      const updated = [{ name, path }, ...filtered].slice(0, 10);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // 最近のプロジェクト削除
  const removeRecentProject = async (path: string) => {
    setRecentProjects((prev) => {
      const updated = prev.filter((p) => p.path !== path);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // プロジェクトを閉じる（ランチャーへ戻る）
  const closeProject = useCallback(async () => {
    bootLog("closeProject called");
    if (closeHandlerRef.current) {
      try {
        await closeHandlerRef.current();
      } catch (err) {
        console.error("Failed to execute closeHandler in closeProject:", err);
      }
    }
    setProjectPath(null);
    setProjectName(null);
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  }, []);

  // プロジェクトを開く
  const openProject = useCallback(
    async (path: string, customName?: string) => {
      bootLog("openProject called:", { path, customName, currentProjectPath: projectPath });
      if (projectPath && projectPath !== path) {
        await closeProject();
      }
      const parts = path.split(/[\\/]/).filter(Boolean);
      const name = customName || parts[parts.length - 1] || "Untitled";

      setProjectPath(path);
      setProjectName(name);
      localStorage.setItem(CURRENT_PROJECT_KEY, path);

      await addRecentProject(name, path);
    },
    [projectPath, closeProject]
  );

  useEffect(() => {
    if (projectPath) {
      localStorage.setItem(CURRENT_PROJECT_KEY, projectPath);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
  }, [projectPath]);

  return (
    <ProjectContext.Provider
      value={{
        projectPath,
        projectName,
        appVersion,
        recentProjects,
        openProject,
        closeProject,
        registerCloseHandler,
        removeRecentProject,
        addRecentProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
};
