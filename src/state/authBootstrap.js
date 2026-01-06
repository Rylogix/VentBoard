import { supabase } from "../data/supabase.js";

const AUTH_ERROR_MESSAGE = "Unable to connect. Refresh and try again.";

export function startAuthBootstrap({ store, actions }) {
  if (!supabase) {
    console.error("[auth] Supabase client missing");
    store.setState({ authLoading: false, authError: AUTH_ERROR_MESSAGE, isAuthReady: false });
    return () => {};
  }

  let subscription = null;

  const setAuthError = (error) => {
    console.error("[auth] bootstrap failed", error);
    store.setState({ authLoading: false, authError: AUTH_ERROR_MESSAGE });
  };

  const applySession = async (session) => {
    const userId = session?.user?.id;
    if (!userId) {
      setAuthError(new Error("Anonymous session missing"));
      return;
    }

    console.log("[auth] user id:", userId);
    store.setState({ userId, authLoading: false, authError: "", isAuthReady: true });

    if (actions && typeof actions.hydrateCooldownState === "function") {
      await actions.hydrateCooldownState(userId);
    }
  };

  const run = async () => {
    store.setState({ authLoading: true, authError: "", isAuthReady: false });

    console.log("[auth] checking session");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setAuthError(error);
      return;
    }

    let session = data.session;
    console.log("[auth] session exists:", !!session);

    if (!session?.user) {
      console.log("[auth] signInAnonymously starting");
      const { data: signData, error: signError } = await supabase.auth.signInAnonymously();
      if (signError) {
        setAuthError(signError);
        return;
      }
      session = signData.session;
      console.log("[auth] session after signInAnonymously:", !!session);

      if (!session?.user) {
        const { data: confirmData, error: confirmError } = await supabase.auth.getSession();
        if (confirmError) {
          setAuthError(confirmError);
          return;
        }
        session = confirmData.session;
        console.log("[auth] session after re-check:", !!session);
      }
    }

    await applySession(session);
  };

  run();

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      console.log("[auth] state change:", event);
      store.setState({ userId: session.user.id, authLoading: false, authError: "", isAuthReady: true });
    }
  });

  subscription = authListener?.subscription;

  const cleanup = () => {
    if (subscription) {
      subscription.unsubscribe();
    }
  };

  window.addEventListener("beforeunload", cleanup, { once: true });

  return cleanup;
}
