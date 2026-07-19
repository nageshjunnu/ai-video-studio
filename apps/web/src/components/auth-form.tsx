"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Sparkle } from "@phosphor-icons/react";
import { API, saveSession } from "@/lib/api";
import { trackedFetch } from "@/lib/request-loader";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData(formElement),
      body = Object.fromEntries(form);
    try {
      const response = await trackedFetch(`${API}/auth/${mode}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(data.message) ? data.message.join(", ") : data.message,
        );
      saveSession(data);
      formElement.reset();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand auth-brand">
          <div className="logo">
            <Play weight="fill" />
          </div>
          <span>Drishyana</span>
        </div>
        <div>
          <div className="ai-pill">
            <Sparkle weight="fill" /> VOICE INTO VISION
          </div>
          <h1>
            Your stories.
            <br />
            <em>Your language.</em>
            <br />
            Your screen.
          </h1>
          <p>
            Create narrated Telugu and English videos using private, local,
            open-source technology.
          </p>
        </div>
        <small>© 2026 Drishyana AI</small>
      </section>
      <section className="auth-panel">
        <form onSubmit={submit}>
          <p className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "START CREATING"}
          </p>
          <h2>
            {mode === "login" ? "Sign in to Drishyana" : "Create your account"}
          </h2>
          <p>
            {mode === "login"
              ? "Continue your stories and videos."
              : "Get 1,000 free credits when you register."}
          </p>
          {mode === "register" && (
            <>
              <label>
                Full name
                <input
                  name="fullName"
                  required
                  minLength={2}
                  placeholder="Your full name"
                />
              </label>
              <label>
                Mobile number
                <input name="mobile" placeholder="Optional mobile number" />
              </label>
            </>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
            />
          </label>
          {mode === "register" && (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder="Repeat password"
              />
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create free account"}
          </button>
          {mode === "login" && (
            <Link className="forgot" href="/forgot-password">
              Forgot password?
            </Link>
          )}
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to Drishyana? <Link href="/register">Create account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link href="/login">Sign in</Link>
              </>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
