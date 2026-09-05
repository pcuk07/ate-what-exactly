import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Session state for the whole app. Design doc §10.4: email one-time code now,
 * Sign in with Apple in Phase 5 — no passwords, so there is no password to
 * leak, reuse, or reset.
 */

interface AuthState {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Restore whatever is in the Keychain before deciding to show sign-in,
    // so a returning user never sees a flash of the login screen.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      async sendCode(email: string) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true },
        });
        if (error) throw new Error(friendly(error.message));
      },
      async verifyCode(email: string, code: string) {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });
        if (error) throw new Error(friendly(error.message));
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Supabase's messages are accurate but terse; these say what to do next. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired")) return "That code has expired. Ask for a new one.";
  if (m.includes("invalid")) return "That code didn't match. Check it and try again.";
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts just now. Wait a minute and try again.";
  }
  return message;
}
