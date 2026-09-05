import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { watchTheme } from "./styles/theme";
import "./styles/tokens.css";
import "./styles/primitives.css";

watchTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
