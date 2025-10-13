import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [name, setName] = useState("");
  const [greetMsg, setGreetMsg] = useState("");
  const [systemInfo, setSystemInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function greet() {
    setLoading(true);
    try {
      const message = await invoke<string>("greet", { name });
      setGreetMsg(message);
    } catch (error) {
      console.error("Error calling greet:", error);
      setGreetMsg("Error: Could not greet");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSystemInfo() {
    setLoading(true);
    try {
      const info = await invoke<string>("get_system_info");
      setSystemInfo(info);
    } catch (error) {
      console.error("Error fetching system info:", error);
      setSystemInfo("Error: Could not fetch system info");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Welcome to Opslane Desktop</h1>

      <div className="card">
        <p className="subtitle">
          A cross-platform desktop app built with Tauri 2.0 + React 19
        </p>

        <div className="input-group">
          <input
            type="text"
            placeholder="Enter your name..."
            aria-label="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && greet()}
          />
          <button
            onClick={greet}
            disabled={loading || !name}
            aria-busy={loading}
            aria-label="Greet user"
          >
            {loading ? "Loading..." : "Greet"}
          </button>
        </div>

        {greetMsg && (
          <div className="message success" role="status" aria-live="polite">
            {greetMsg}
          </div>
        )}

        <div className="divider" />

        <button
          onClick={fetchSystemInfo}
          disabled={loading}
          className="secondary"
          aria-busy={loading}
          aria-label="Get system information"
        >
          {loading ? "Loading..." : "Get System Info"}
        </button>

        {systemInfo && (
          <div className="message info" role="status" aria-live="polite">
            <pre>{systemInfo}</pre>
          </div>
        )}
      </div>

      <div className="footer">
        <p className="tech-stack">
          <strong>Tech Stack:</strong> Tauri 2.0 • React 19 • TypeScript • Vite • Tailwind CSS
        </p>
      </div>
    </div>
  );
}

export default App;
