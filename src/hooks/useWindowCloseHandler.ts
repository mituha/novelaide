import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useProject } from "../contexts/ProjectContext";
import { bootLog } from "../utils/bootLogger";

/**
 * アプリケーション終了（ウィンドウの×ボタンや終了操作）時に、
 * 未保存ドキュメントの保存およびプロジェクトクローズ処理を安全に完了させるフック
 */
export const useWindowCloseHandler = () => {
  const { closeProject } = useProject();
  const isClosingRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriCloseHandler = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event) => {
          bootLog("[useWindowCloseHandler] onCloseRequested triggered");
          if (isClosingRef.current) {
            return;
          }
          // 即時のウィンドウ破棄を抑止
          event.preventDefault();
          isClosingRef.current = true;

          try {
            // プロジェクトクローズ（未保存ドキュメントの自動保存とクリーンアップ）
            await closeProject();
          } catch (err) {
            console.error("[useWindowCloseHandler] Failed during closeProject on exit:", err);
          } finally {
            try {
              // クリーンアップ完了後にウィンドウを破棄
              await appWindow.destroy();
            } catch (destroyErr) {
              console.error("[useWindowCloseHandler] Failed to destroy window:", destroyErr);
            }
          }
        });
      } catch (e) {
        // ブラウザ実行環境やテスト時などのフォールバック
        console.warn("[useWindowCloseHandler] Could not register Tauri onCloseRequested:", e);
      }
    };

    setupTauriCloseHandler();

    // Web環境やブラウザリロード対策としての beforeunload
    const handleBeforeUnload = () => {
      bootLog("[useWindowCloseHandler] beforeunload triggered");
      closeProject();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (unlisten) {
        unlisten();
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [closeProject]);
};
