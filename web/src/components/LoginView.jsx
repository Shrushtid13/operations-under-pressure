// web/src/components/LoginView.jsx
import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Bot, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';

export function LoginView({ onLoginSuccess, initialEmail = '' }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialEmail ? 'Password123!' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');

    try {
      const data = await api.login(email, password);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setLoading(true);
    setError('');

    try {
      const data = await api.login(demoEmail, 'Password123!');
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-5">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold text-xl text-white mx-auto shadow-md shadow-indigo-600/25">
          <Bot className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">SwarmOps Command Center</h1>
        <p className="text-xs text-slate-500">
          Autonomous Incident & Multi-Agent Operations Console
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="alice@newtonite.test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Operations'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Sign-in */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
            One-Click Role Profiles
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('alice@newtonite.test')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 text-left transition flex items-center gap-2 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                A
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-xs">Alice</div>
                <div className="text-[10px] text-slate-500 truncate">Lead (Ops, Core)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('bob@newtonite.test')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 text-left transition flex items-center gap-2 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                B
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-xs">Bob</div>
                <div className="text-[10px] text-slate-500 truncate">Lead (Peer)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('charlie@newtonite.test')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-200 text-left transition flex items-center gap-2 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[10px]">
                C
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-xs">Charlie</div>
                <div className="text-[10px] text-slate-500 truncate">Engineer / Member</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('dana@newtonite.test')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition flex items-center gap-2 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                D
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-xs">Dana</div>
                <div className="text-[10px] text-slate-500 truncate">Viewer / Auditor</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('admin@newtonite.test')}
              className="col-span-2 p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50/50 border border-slate-200 hover:border-amber-200 text-left transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <div>
                <span className="font-semibold text-slate-900 text-xs">Eve Admin </span>
                <span className="text-[11px] text-slate-500">(Org Admin Telemetry)</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
