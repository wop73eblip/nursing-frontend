import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import NursePage from "./pages/NursePage";
import AdminPage from "./pages/AdminPage";
import DataPage from "./pages/DataPage";
import GameAdminPage from "./pages/GameAdminPage";
import SystemCardsPage from "./pages/SystemCardsPage";
import { getAuth } from "./auth";

function RequireAuth(
  { children, adminOnly = false, superOnly = false }:
  { children: ReactElement; adminOnly?: boolean; superOnly?: boolean }
) {
  const user = getAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (superOnly && user.role !== "superadmin")
    return <Navigate to="/home" replace />;
  if (adminOnly && !["admin", "superadmin", "dual"].includes(user.role))
    return <Navigate to="/nurse" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/data" element={<RequireAuth><DataPage /></RequireAuth>} />
        <Route path="/game-admin" element={<RequireAuth superOnly><GameAdminPage /></RequireAuth>} />
        <Route path="/system-cards" element={<RequireAuth superOnly><SystemCardsPage /></RequireAuth>} />
        <Route path="/nurse" element={<RequireAuth><NursePage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth adminOnly><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
