import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CinemaApprovalPage } from "./CinemaApprovalPage";
import "../styles.css";
import "./cinema-approval.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CinemaApprovalPage />
  </StrictMode>,
);
