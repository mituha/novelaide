import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootLog } from "./utils/bootLogger";

bootLog("main.tsx module loaded, mounting React root...");

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  bootLog("React root.render() called");
} else {
  console.error("Root element #root not found!");
}
