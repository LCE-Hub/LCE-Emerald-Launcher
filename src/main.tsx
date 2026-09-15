import React from "react";
import ReactDOM from "react-dom/client";
import "tauri-plugin-gamepad-api";
import "./i18n/config";
import App from "./pages/App";
import "./css/index.css";
import "./css/App.css";
import { LauncherProvider } from "./context/LauncherContext";
import { PluginProvider } from "./plugins/PluginContext";
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PluginProvider>
      <LauncherProvider>
        <App />
      </LauncherProvider>
    </PluginProvider>
  </React.StrictMode>
);