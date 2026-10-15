import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./shadcn.css";
import "./avatar.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={400}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
