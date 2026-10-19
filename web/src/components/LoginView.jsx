// web/src/components/LoginView.jsx
import React, { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, UserPlus } from 'lucide-react';
import { api } from '../api.js';

export function LoginView({ onLoginSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('lead');
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === 'register' && !name.trim()) return;

    setLoading(true);
    setError('');

    const normalizedEmail = (email || '').trim().toLowerCase();

    try {
      if (mode === 'register') {
        const data = await api.register(normalizedEmail, name.trim(), password, {
          role,
          workspace_name: workspaceName.trim() || undefined,
          invite_code: inviteCode.trim().toUpperCase() || undefined
        });
        onLoginSuccess(data.user);
      } else {
        const data = await api.login(normalizedEmail, password);
        onLoginSuccess(data.user);
      }
    } catch (err) {
      if (mode === 'signin' && (err.status === 401 || err.message?.toLowerCase().includes('invalid') || err.message?.toLowerCase().includes('credentials'))) {
        setError('Invalid email or password.');
      } else {
        setError(err.message || (mode === 'register' ? 'Registration failed' : 'Invalid email or password'));
      }
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

  const demoAccounts = [
    { email: 'alice@newtonite.test', name: 'Alice Walker', role: 'Lead', initial: 'AW', color: 'bg-[#8c6d3f]' },
    { email: 'bob@newtonite.test', name: 'Bob Vance', role: 'Lead', initial: 'BV', color: 'bg-[#5b7382]' },
    { email: 'charlie@newtonite.test', name: 'Charlie Green', role: 'Member', initial: 'CG', color: 'bg-[#2e7d32]' },
    { email: 'dana@newtonite.test', name: 'Dana Scott', role: 'Viewer', initial: 'DS', color: 'bg-[#64748b]' },
    { email: 'admin@newtonite.test', name: 'Eve Admin', role: 'Org admin', initial: 'EA', color: 'bg-[#0f1f2e]' }
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f3f5f7]">
      {/* Left Ink Panel */}
      <div className="w-full md:w-5/12 bg-[#0f1f2e] text-white p-8 md:p-14 flex flex-col justify-between">
        <div>
          <div className="text-xl font-bold tracking-tight text-white mb-12">Operations</div>
          <h1 className="text-3xl md:text-4xl font-semibold leading-tight text-slate-100 max-w-md">
            Every request has an owner, a state and a history.
          </h1>
          <p className="mt-6 text-sm text-slate-400 max-w-sm leading-relaxed">
            High-concurrency operational coordination with atomic claims, field-level merge, and immutable audit trails.
          </p>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800 text-xs text-slate-500">
          Operations Under Pressure · Newtonite Engineering
        </div>
      </div>

      {/* Right Login & Registration Form */}
      <div className="w-full md:w-7/12 p-8 md:p-14 flex items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          {/* Mode Switch Tabs */}
          <div className="flex items-center justify-between border-b border-[#e3e8ee] pb-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                {mode === 'signin' ? 'Sign in' : 'Create an account'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {mode === 'signin'
                  ? 'Enter your credentials or pick a demo account below.'
                  : 'Register your own email to access all operational tools.'}
              </p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign Up
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="font-medium">{error}</span>
              </div>
              {mode === 'signin' && (
                <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between text-[11.5px]">
                  <span className="text-rose-600">Haven't registered this email yet?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError('');
                    }}
                    className="font-bold text-[#2f5bea] hover:underline cursor-pointer ml-2"
                  >
                    Register now →
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-[#e3e8ee] rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email address</label>
              <input
                type="email"
                required
                placeholder={mode === 'signin' ? 'alice@newtonite.test' : 'your.name@company.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-[#e3e8ee] rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Password {mode === 'register' && <span className="text-slate-400 font-normal">(min 8 characters)</span>}
              </label>
              <input
                type="password"
                required
                minLength={mode === 'register' ? 8 : 1}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-[#e3e8ee] rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea]"
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Default Team Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('lead')}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer text-xs ${
                        role === 'lead'
                          ? 'border-[#2f5bea] bg-blue-50/60 text-blue-900 font-semibold'
                          : 'border-[#e3e8ee] bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">Team Lead</div>
                      <div className="text-[11px] text-slate-500 font-normal">Assign, approve fixes & manage items</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('member')}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer text-xs ${
                        role === 'member'
                          ? 'border-[#2f5bea] bg-blue-50/60 text-blue-900 font-semibold'
                          : 'border-[#e3e8ee] bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">Team Member</div>
                      <div className="text-[11px] text-slate-500 font-normal">Claim tasks, submit fixes & attach files</div>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-700">Company / Workspace Name</label>
                      <span className="text-[11px] text-slate-400">Optional</span>
                    </div>
                    <input
                      type="text"
                      disabled={Boolean(inviteCode)}
                      placeholder="e.g. Acme Corp, Stripe Ops"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="w-full bg-white border border-[#e3e8ee] rounded-lg px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] disabled:opacity-40"
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Creates an isolated private workspace for your team.</div>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink mx-2 text-[10px] text-slate-400 font-medium uppercase tracking-wider">or invite code</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-700">Invitation Code</label>
                      <span className="text-[11px] text-slate-400">Optional</span>
                    </div>
                    <input
                      type="text"
                      disabled={Boolean(workspaceName)}
                      placeholder="e.g. INV-A93E-B41C"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="w-full font-mono uppercase bg-white border border-[#e3e8ee] rounded-lg px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] disabled:opacity-40"
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Join an existing workspace created by your lead.</div>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#2f5bea] hover:bg-[#264ecc] text-white rounded-lg text-sm font-semibold flex items-center justify-center space-x-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <span>
                {loading
                  ? (mode === 'register' ? 'Creating account...' : 'Authenticating...')
                  : (mode === 'register' ? 'Create Account & Sign In' : 'Sign in')}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Toggle Helper Link */}
          <div className="text-center text-xs text-slate-500">
            {mode === 'signin' ? (
              <span>
                Want to use your personal email?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); }}
                  className="text-[#2f5bea] font-semibold hover:underline cursor-pointer"
                >
                  Create an account
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); }}
                  className="text-[#2f5bea] font-semibold hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>

          {/* One-Click Demo Profiles (Only in Sign In mode) */}
          {mode === 'signin' && (
            <div className="pt-5 border-t border-[#e3e8ee] space-y-3">
              <div className="text-xs font-medium text-slate-500">
                Or one-click demo accounts (password: <code className="text-slate-700 font-mono">Password123!</code>):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleQuickLogin(acc.email)}
                    className="p-2.5 rounded-lg bg-white border border-[#e3e8ee] hover:border-[#2f5bea] text-left transition flex items-center space-x-2.5 cursor-pointer shadow-xs"
                  >
                    <div className={`w-7 h-7 rounded-full ${acc.color} text-white flex items-center justify-center text-xs font-medium shrink-0`}>
                      {acc.initial}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 text-xs truncate">{acc.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{acc.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
