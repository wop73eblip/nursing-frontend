import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import LoginPage from "./pages/LoginPage";
import NursePage from "./pages/NursePage";
import AdminPage from "./pages/AdminPage";
import { getAuth } from "./auth";

function RequireAuth({ children, adminOnly = false }: { children: ReactElement; adminOnly?: boolean }) {
  const user = getAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !["admin", "superadmin", "dual"].includes(user.role))
    return <Navigate to="/nurse" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/nurse" element={<RequireAuth><NursePage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth adminOnly><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
