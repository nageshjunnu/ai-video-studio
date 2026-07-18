"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/login": "Sign in",
  "/register": "Create account",
  "/forgot-password": "Forgot password",
  "/reset-password": "Reset password",
  "/projects": "Projects",
  "/templates": "Templates",
  "/analytics": "Analytics",
  "/buy-credits": "Buy credits",
  "/tools": "Creator tools",
  "/account": "My account",
  "/notifications": "Notifications",
  "/team": "Team workspace",
  "/admin": "Admin dashboard",
  "/admin/features": "Creator tool access",
  "/admin/notifications": "Notification center",
  "/admin/videos": "Video management",
};

export function PageTitle() {
  const pathname = usePathname();
  useEffect(() => {
    const base = pathname?.startsWith("/videos/") ? "Video details" : titles[pathname || "/"] || "Drishyana AI";
    document.title = `${base} — Drishyana AI`;
  }, [pathname]);
  return null;
}
