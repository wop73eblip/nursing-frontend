export interface AuthUser {
  uid: string;
  name: string;
  role: "nurse" | "dual" | "admin" | "superadmin";
  token: string;
}

export function saveAuth(user: AuthUser) {
  localStorage.setItem("token", user.token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function getAuth(): AuthUser | null {
  const raw = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (!raw || !token) return null;
  return { ...JSON.parse(raw), token };
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function isAdmin(role: string) {
  return ["admin", "superadmin", "dual"].includes(role);
}
