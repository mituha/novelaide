import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { ProjectItem } from "restar-app";
import { bootLog } from "../utils/bootLogger";

interface ProjectContextType {
  projectPath: string | null;
  projectName: string | null;
  recentProjects: ProjectItem[];
  openProject: (path: string, name?: string) => Promise<void>;
  closeProject: () => void;
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

  // プロジェクトを開く
  const openProject = async (path: string, customName?: string) => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    const name = customName || parts[parts.length - 1] || "Untitled";

    bootLog("openProject called:", { path, name });
    setProjectPath(path);
    setProjectName(name);
    localStorage.setItem(CURRENT_PROJECT_KEY, path);

    await addRecentProject(name, path);
  };

  // プロジェクトを閉じる（ランチャーへ戻る）
  const closeProject = () => {
    bootLog("closeProject called");
    setProjectPath(null);
    setProjectName(null);
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  };

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
        recentProjects,
        openProject,
        closeProject,
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
