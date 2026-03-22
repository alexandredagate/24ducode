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

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 grid-bg relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.03) 0%, transparent 70%)" }}
      />

      <div className="w-full max-w-sm relative animate-fade-in-up">
        {/* Card */}
        <div className="card card-accent-cyan p-8 sm:p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 animate-float"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.1), rgba(59,130,246,0.1))",
                border: "1px solid rgba(0,229,255,0.2)",
                boxShadow: "0 0 30px rgba(0,229,255,0.08)",
              }}
            >
              <span className="text-3xl" style={{ filter: "drop-shadow(0 0 8px rgba(0,229,255,0.4))" }}>⛵</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight" style={{ textShadow: "0 0 20px rgba(0,229,255,0.2)" }}>
              3026
            </h1>
            <p className="text-zinc-500 mt-1 text-sm">Dashboard de commandement</p>
          </div>

          {/* Connection status */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="relative">
              <div
                className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ boxShadow: connected ? "0 0 8px rgba(52,211,153,0.6)" : "0 0 8px rgba(245,158,11,0.6)" }}
              />
              {!connected && (
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-400 animate-ping opacity-75" />
              )}
            </div>
            <span className="text-xs text-zinc-500">
              {connected ? "Serveur connecte" : "Connexion en cours..."}
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="pin" className="block text-xs font-medium text-zinc-400 mb-2 text-center uppercase tracking-wider">
                Code PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="----"
                maxLength={8}
                className="w-full px-4 py-3.5 rounded-xl text-white text-2xl font-mono text-center tracking-[0.5em] placeholder-zinc-700 input-gaming"
                style={{ letterSpacing: "0.5em" }}
              />
            </div>

            {displayError && (
              <div className="px-4 py-2.5 rounded-xl text-sm text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !pin.trim()}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold btn-primary"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connexion...
                </span>
              ) : "Se connecter"}
            </button>
          </form>
        </div>

        {/* Subtle footer */}
        <p className="text-center text-[11px] text-zinc-700 mt-4">
          Systeme de commandement naval v3026
        </p>
      </div>
    </div>
  );
}
