import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    if (!name.trim()) {
      setGreetMsg(await invoke("greet", { name: "執筆者" }));
    } else {
      setGreetMsg(await invoke("greet", { name }));
    }
  }

  return (
    <main className="container">
      <h1>novelaide</h1>
      <p className="subtitle">小説執筆用エディター (Tauri 2.x + React + TypeScript)</p>

      <div className="row">
        <a href="https://tauri.app" target="_blank" rel="noreferrer">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <div className="card">
        <h2>Rustバックエンド疎通確認</h2>
        <p>フロントエンドからRustバックエンドのコマンド（greet）を呼び出します。</p>

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            id="greet-input"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="お名前または執筆ネームを入力..."
          />
          <button type="submit">送信</button>
        </form>
        {greetMsg && <p className="greet-response">{greetMsg}</p>}
      </div>
    </main>
  );
}

export default App;
