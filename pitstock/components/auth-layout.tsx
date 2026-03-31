"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { Navbar } from "@/components/navbar";
import { LoginDialog } from "@/components/login-dialog";
import { getAuthState, logout } from "@/lib/actions";

interface AuthContextType {
  user: { userId: string; name: string } | null;
}

const AuthContext = createContext<AuthContextType>({ user: null });
export const useAuth = () => useContext(AuthContext);

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ userId: string; name: string } | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAuthState().then((session) => {
      setUser(session);
      setLoaded(true);
    });
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  function handleLoginSuccess(loggedInUser: { userId: string; name: string }) {
    setUser(loggedInUser);
    setLoginDialogOpen(false);
  }

  if (!loaded) return null;

  return (
    <AuthContext value={{ user }}>
      <Navbar
        user={user}
        onLogout={handleLogout}
        onLoginClick={() => setLoginDialogOpen(true)}
      />
      {user ? (
        children
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-foreground/50 text-sm mb-4">로그인이 필요합니다</p>
            <button
              className="text-sm underline text-foreground/70 hover:text-foreground"
              onClick={() => setLoginDialogOpen(true)}
            >
              로그인하기
            </button>
          </div>
        </div>
      )}
      <LoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        onLoginSuccess={handleLoginSuccess}
      />
    </AuthContext>
  );
}
