import React, { useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ProjectLauncher as LibProjectLauncher } from "restar-app";
import { Feather } from "lucide-react";
import { useProject } from "../../contexts/ProjectContext";
import "restar-app/index.css";
import "./ProjectLauncherModal.css";

export interface ProjectLauncherModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const ProjectLauncherModal: React.FC<ProjectLauncherModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    projectPath,
    recentProjects,
    openProject,
    removeRecentProject,
    appVersion,
  } = useProject();

  // Esc キー押下で閉じる（プロジェクト選択時のみ）
  useEffect(() => {
    if (!isOpen || !projectPath) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, projectPath, onClose]);

  // フォルダ選択ダイアログ
  const handlePickDirectory = useCallback(async (): Promise<string | undefined> => {
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
  }, []);

  // プロジェクトを開く
  const handleOpenProject = useCallback(
    async (path: string) => {
      await openProject(path);
      onClose?.();
    },
    [openProject, onClose]
  );

  // 新規プロジェクト作成
  const handleCreateProject = useCallback(
    async (params: {
      parentDir: string;
      name: string;
    }): Promise<string | undefined> => {
      const separator = params.parentDir.includes("\\") ? "\\" : "/";
      const fullPath = `${params.parentDir}${separator}${params.name}`;
      await openProject(fullPath, params.name);
      onClose?.();
      return fullPath;
    },
    [openProject, onClose]
  );

  if (!isOpen) return null;

  // プロジェクトが開かれている状態での呼び出しはモーダルオーバーレイ、未設定時は全画面表示
  const isModalMode = !!projectPath;

  const content = (
    <LibProjectLauncher
      title="novelaide"
      subtitle="作品フォルダー（執筆プロジェクト）を選択してください"
      version={appVersion ? `v${appVersion}` : undefined}
      logoIcon={<Feather size={48} style={{ color: "var(--accent-color)" }} />}
      recentProjects={recentProjects}
      onOpenProject={handleOpenProject}
      onPickDirectory={handlePickDirectory}
      onCreateProject={handleCreateProject}
      onRemoveRecent={removeRecentProject}
      isBackEnabled={isModalMode}
      onBack={onClose}
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
        backButtonTitle: "執筆エディターに戻る (Esc)",
      }}
    />
  );

  if (!isModalMode) {
    return <div className="project-launcher-fullscreen">{content}</div>;
  }

  return (
    <div
      className="project-launcher-modal-overlay"
      onClick={(e) => {
        // カード外側のクリックで閉じる
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="作品フォルダーの選択"
    >
      {content}
    </div>
  );
};
