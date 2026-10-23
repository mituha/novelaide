import { open } from "@tauri-apps/plugin-dialog";
import { ProjectLauncher as LibProjectLauncher } from "restar-app";
import { Feather } from "lucide-react";
import { useProject } from "../contexts/ProjectContext";
import "restar-app/index.css";

interface ProjectLauncherPageProps {
  onNavigateToEditor?: () => void;
}

export const ProjectLauncherPage: React.FC<ProjectLauncherPageProps> = ({
  onNavigateToEditor,
}) => {
  const {
    projectPath,
    recentProjects,
    openProject,
    removeRecentProject,
  } = useProject();

  // フォルダ選択ダイアログ
  const handlePickDirectory = async (): Promise<string | undefined> => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "作品フォルダー（プロジェクト）を選択",
      });

      if (typeof selected === "string") {
        return selected;
      }
      return undefined;
    } catch (err) {
      console.error("フォルダ選択ダイアログエラー:", err);
      return undefined;
    }
  };

  // プロジェクトを開く
  const handleOpenProject = async (path: string) => {
    await openProject(path);
    onNavigateToEditor?.();
  };

  // 新規プロジェクト作成
  const handleCreateProject = async (params: {
    parentDir: string;
    name: string;
  }): Promise<string | undefined> => {
    const separator = params.parentDir.includes("\\") ? "\\" : "/";
    const fullPath = `${params.parentDir}${separator}${params.name}`;
    await openProject(fullPath, params.name);
    onNavigateToEditor?.();
    return fullPath;
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <LibProjectLauncher
        title="novelaide"
        subtitle="作品フォルダー（執筆プロジェクト）を選択してください"
        version="v0.2.0"
        logoIcon={<Feather size={48} style={{ color: "var(--accent-color)" }} />}
        recentProjects={recentProjects}
        onOpenProject={handleOpenProject}
        onPickDirectory={handlePickDirectory}
        onCreateProject={handleCreateProject}
        onRemoveRecent={removeRecentProject}
        isBackEnabled={!!projectPath}
        onBack={onNavigateToEditor}
        labels={{
          openFolder: "既存の作品フォルダーを開く",
          openFolderDesc: "執筆中の原稿フォルダーを選択して開きます",
          createProject: "新しい作品を作成する",
          createProjectDesc: "新規プロジェクトフォルダーを作成します",
          parentDirLabel: "保存先フォルダー",
          projectNameLabel: "作品タイトル（フォルダー名）",
          createButton: "作品を作成して開く",
          cancelButton: "キャンセル",
          browseButton: "参照...",
          backButtonTitle: "執筆エディターに戻る",
        }}
      />
    </div>
  );
};
