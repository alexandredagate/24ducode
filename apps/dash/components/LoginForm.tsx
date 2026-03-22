"use client";

import { useState } from "react";

interface LoginFormProps {
  onLogin: (pin: string) => Promise<void>;
  connected: boolean;
  error: string | null;
}

export function LoginForm({ onLogin, connected, error }: LoginFormProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setLocalError(null);
    try {
      await onLogin(pin.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 cyber-grid-bg-strong" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(0,240,255,0.06) 0%, var(--background) 70%)" }}>
      <div className="w-full max-w-xs p-8 rounded-2xl glass glow-cyan animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-3 animate-float">&#9875;</div>
          <h1 className="text-3xl font-bold text-white tracking-tight" style={{ textShadow: "0 0 20px rgba(0,240,255,0.3)" }}>3026</h1>
          <p className="text-zinc-400 mt-1 text-sm">Dashboard de commandement</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-yellow-500"} animate-pulse`}
            style={{ boxShadow: connected ? "0 0 8px rgba(52,211,153,0.6)" : "0 0 8px rgba(234,179,8,0.6)" }}
          />
          <span className="text-xs text-zinc-400">
            {connected ? "Serveur connecté" : "En attente du serveur..."}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-zinc-300 mb-1.5 text-center">
              Code PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="····"
              maxLength={8}
              className="w-full px-4 py-3 rounded-lg text-white text-2xl font-mono text-center tracking-[0.5em] placeholder-zinc-600 input-gaming"
            />
          </div>

          {(localError ?? error) && (
            <div className="px-3 py-2 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 text-sm text-center glow-red">
              {localError ?? error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="w-full py-2.5 px-4 rounded-lg text-sm btn-gaming"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
