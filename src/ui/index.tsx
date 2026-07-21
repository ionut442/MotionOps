import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ApplicationStateProvider } from "./ApplicationStateProvider";
import "./styles.css";
import "./redesign.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("MotionOps UI root is missing.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ApplicationStateProvider>
      <App />
    </ApplicationStateProvider>
  </React.StrictMode>
);
