import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { useDocument } from "../contexts/DocumentContext";
import { bootLog } from "../utils/bootLogger";

/**
 * アプリケーション終了（ウィンドウの×ボタンや終了操作）時に、
 * 未保存ドキュメントの安全なディスク保存のみを行い、
 * プロジェクト選択画面への画面リセット（closeProject）は行わずにウィンドウを安全に破棄・終了するフック
 */
export const useWindowCloseHandler = () => {
  const { saveAllDocuments } = useDocument();
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
            // 未保存ドキュメントのみをディスクに自動保存（プロジェクト状態や履歴キーは維持）
            await saveAllDocuments();
          } catch (err) {
            console.error("[useWindowCloseHandler] Failed during saveAllDocuments on exit:", err);
          } finally {
            try {
              // クリーンアップ完了後にウィンドウを破棄
              await appWindow.destroy();
            } catch (destroyErr) {
              console.warn("[useWindowCloseHandler] appWindow.destroy failed, falling back to process.exit:", destroyErr);
              try {
                await exit(0);
              } catch (exitErr) {
                console.error("[useWindowCloseHandler] Failed to exit process:", exitErr);
              }
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
      saveAllDocuments();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (unlisten) {
        unlisten();
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveAllDocuments]);
};
