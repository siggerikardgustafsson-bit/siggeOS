import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

// DEV_USER is a LOCAL-ONLY auth bypass for development. It is hard-gated behind
// import.meta.env.DEV, which Vite sets to false in production builds (`vite build`),
// so it is stripped from any shipped bundle. This removes the multi-user risk of
// accidentally shipping a hard-coded identity that bypasses authentication.
const DEV_USER = import.meta.env.DEV && import.meta.env.VITE_DEV_USER
  ? { id: import.meta.env.VITE_DEV_USER, email: 'dev@local', role: 'authenticated' }
  : null

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_USER)
  const [loading, setLoading] = useState(!DEV_USER)
  // True after the user follows a password-reset link — Login uses this to show
  // the "set a new password" form instead of the normal sign-in form.
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (DEV_USER) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email, password, displayName) => {
    // display_name is forwarded into auth metadata so the `handle_new_user`
    // DB trigger seeds the profiles row with a real name on signup (Phase 16).
    const meta = displayName && displayName.trim() ? { display_name: displayName.trim() } : undefined
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    // When email confirmation is enabled, Supabase returns a user with an
    // empty `identities` array and no session — the caller uses this to show
    // a "check your inbox" message instead of assuming an active session.
    const needsEmailConfirmation = !error && !data?.session && !!data?.user
    return { error, needsEmailConfirmation }
  }

  // Sends a password-reset email; the link returns the user to /login where
  // updatePassword() can be called from a recovery session.
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return { error }
  }

  // Sets a new password (used after following a recovery link, or to change it
  // while signed in).
  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, resetPassword, updatePassword, recovery, clearRecovery: () => setRecovery(false) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
