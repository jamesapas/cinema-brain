"use client";

import { createContext, useContext } from "react";

import { useAuthOverlay } from "@/app/components/auth-overlay";

/**
 * Whether the person looking at the page has an account, for the client
 * components that gate on it.
 *
 * This is a convenience, not a boundary. Every gated action is checked again
 * on the server — the rating and profile Server Functions verify the caller,
 * /api/chat answers 401, and RLS sits under all of it. What this saves is
 * offering someone a control that would only fail: the stars open the sign-in
 * panel instead of writing nothing, and Kino says so rather than opening a
 * transcript he cannot save.
 *
 * Defaults to false, so a component used outside the provider treats the
 * visitor as signed out rather than assuming the generous case.
 */
const SessionContext = createContext(false);

export function SessionProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={signedIn}>{children}</SessionContext.Provider>;
}

export function useSignedIn() {
  return useContext(SessionContext);
}

/**
 * Asks for an account without going anywhere. `reason` names what prompted it,
 * so the panel can say "To rate this film" over the form.
 */
export function useSignIn() {
  return useAuthOverlay().open;
}
