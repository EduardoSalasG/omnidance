"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setLoading(true);
    const res = await apiFetch("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.ok) setSent(true);
    else setError(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {sent ? (
        <p className="max-w-sm text-center text-white/70">{t("sent")}</p>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-white/70">{t("emailLabel")}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="rounded-xl border border-night-700 bg-night-900 px-4 py-3 text-white outline-none focus:border-neon"
            />
          </label>
          {error && <p className="text-sm text-red-400">{t("invalidEmail")}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-neon px-5 py-3 font-semibold text-night-950 disabled:opacity-50"
          >
            {loading ? "…" : t("submit")}
          </button>
        </form>
      )}
    </main>
  );
}
