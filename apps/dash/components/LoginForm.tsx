"use client";

import { useEffect, useState } from "react";

interface LoginFormProps {
  onLogin: (codingGameId: string) => Promise<void>;
  connected: boolean;
  error: string | null;
}

export function LoginForm({ onLogin, connected, error }: LoginFormProps) {
  const [codingGameId, setCodingGameId] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("codingGameId");
    if (stored) setCodingGameId(stored);
  }, []);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codingGameId.trim()) return;
    setLoading(true);
    setLocalError(null);
    try {
      localStorage.setItem("codingGameId", codingGameId.trim());
      await onLogin(codingGameId.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-3">⚓</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">3026</h1>
          <p className="text-zinc-400 mt-1 text-sm">Dashboard de commandement</p>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-yellow-500"} animate-pulse`}
          />
          <span className="text-xs text-zinc-400">
            {connected ? "Serveur connecté" : "En attente du serveur..."}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="coding-game-id" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Coding Game ID
            </label>
            <textarea
              id="coding-game-id"
              value={codingGameId}
              onChange={(e) => setCodingGameId(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              rows={4}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {(localError ?? error) && (
            <div className="px-3 py-2 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
              {localError ?? error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !codingGameId.trim()}
            className="w-full py-2.5 px-4 rounded-lg bg-white text-zinc-950 font-semibold text-sm transition-all hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
