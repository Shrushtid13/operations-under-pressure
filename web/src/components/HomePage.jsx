// web/src/components/HomePage.jsx
import React, { useState } from 'react';
import {
  FileCheck,
  PenLine,
  History,
  ArrowRight,
  X,
  AlertCircle
} from 'lucide-react';
import { api } from '../api.js';

export function HomePage({ onSignInClick, onLoginSuccess, currentUser }) {
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Auth form state (self-contained — no LoginView dependency)
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('lead');
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOpenAuth = () => {
    if (onSignInClick) {
      onSignInClick();
    } else {
      setShowAuthModal(true);
    }
  };

  const resetForm = () => {
    setMode('signin');
    setName('');
    setEmail('');
    setPassword('');
    setRole('lead');
    setWorkspaceName('');
    setInviteCode('');
    setError('');
    setLoading(false);
  };

  const handleCloseModal = () => {
    setShowAuthModal(false);
    resetForm();
  };

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
        setShowAuthModal(false);
        resetForm();
        if (onLoginSuccess) onLoginSuccess(data.user);
      } else {
        const data = await api.login(normalizedEmail, password);
        setShowAuthModal(false);
        resetForm();
        if (onLoginSuccess) onLoginSuccess(data.user);
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
      setShowAuthModal(false);
      resetForm();
      if (onLoginSuccess) onLoginSuccess(data.user);
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

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white">

      {/* ═══════════════════ NAVIGATION BAR ═══════════════════ */}
      <header className="sticky top-0 z-40 bg-[#0B1320] border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-white font-bold text-lg tracking-tight">Operations</span>
          </div>
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <button onClick={() => scrollToSection('product')} className="hover:text-white transition cursor-pointer">Product</button>
            <button onClick={() => scrollToSection('how-it-works')} className="hover:text-white transition cursor-pointer">How it works</button>
            <button onClick={() => scrollToSection('access')} className="hover:text-white transition cursor-pointer">Access</button>
          </nav>
          <div className="flex items-center space-x-3">
            {currentUser ? (
              <a href="#/overview" className="bg-white text-slate-900 hover:bg-slate-100 font-semibold px-4 py-1.5 rounded-md text-sm transition shadow-xs flex items-center gap-1.5">
                <span>Console</span><ArrowRight className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button onClick={handleOpenAuth} className="bg-white text-slate-900 hover:bg-slate-100 font-semibold px-4 py-1.5 rounded-md text-sm transition shadow-xs cursor-pointer">Sign in</button>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════ HERO SECTION ═══════════════════ */}
      <section className="bg-[#0B1320] text-white pt-16 pb-24 px-6 border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Content */}
          <div className="lg:col-span-7 flex flex-col items-start">
            <div className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-normal text-slate-300 bg-slate-800/80 border border-slate-700/80 mb-6">
              Built for teams that cannot afford dropped requests
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-white leading-[1.12] mb-6">
              Every request has an owner, a state and a history.
            </h1>
            <p className="text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-xl mb-8">
              Replace chat threads and spreadsheets with one place where work is claimed without
              collisions, edited without overwriting a colleague, and recorded without gaps.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleOpenAuth} className="bg-[#2563eb] hover:bg-blue-600 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition shadow-sm cursor-pointer">Sign in</button>
              <button onClick={() => scrollToSection('product')} className="bg-[#1e293b]/70 hover:bg-[#1e293b] border border-slate-700 text-slate-200 font-medium px-5 py-2.5 rounded-lg text-sm transition cursor-pointer">See how it works</button>
            </div>
          </div>

          {/* Right Preview Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-slate-900 border border-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="font-semibold text-sm text-slate-900">Needs attention</span>
                <span className="text-amber-600 font-bold text-sm">3</span>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  { title: 'Card payments failing for EU merchants', id: 'PAY-89', status: 'Pending approval', dot: 'bg-amber-500', avatar: 'AW', avatarBg: 'bg-emerald-600' },
                  { title: 'Vendor attestation due Friday', id: 'OPS-12', status: 'Open', dot: 'bg-blue-500', avatar: 'CG', avatarBg: 'bg-slate-600' },
                  { title: 'Checkout latency above 2s on mobile', id: 'ENG-112', status: 'In progress', dot: 'bg-emerald-500', avatar: 'BV', avatarBg: 'bg-emerald-600' },
                ].map((item) => (
                  <div key={item.id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono text-slate-400">{item.id}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`}></span>
                        <span className="text-[11px] text-slate-500">{item.status}</span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full ${item.avatarBg} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>{item.avatar}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-normal">
                Bob claimed ENG-112 a moment before you. It is his now.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ THREE GUARANTEES ═══════════════════ */}
      <section id="product" className="py-20 px-6 bg-[#f8fafc] border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-10 max-w-xl leading-snug">
            Three guarantees the server enforces, not the interface.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: FileCheck, title: 'Claim without colliding', text: 'Two people reach for the same request and exactly one gets it. The other sees who, instantly instead of working in parallel.' },
              { icon: PenLine, title: 'Edit without overwriting', text: 'Different fields from different people merge. When two people change the same field, you see both values and choose.' },
              { icon: History, title: 'History that cannot vanish', text: 'Every change records who did it, when and why. History is append-only, and the database itself refuses edits to it.' },
            ].map((g) => (
              <div key={g.title} className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5"><g.icon className="w-5 h-5" /></div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{g.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{g.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ THREE STEPS ═══════════════════ */}
      <section id="how-it-works" className="py-20 px-6 bg-white border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-12">From request to record in three steps.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: '1', title: 'Capture', text: 'Log a customer issue, incident, payment or compliance task with its purpose, priority and due date.' },
              { n: '2', title: 'Route and approve', text: 'Claim it, assign it, or send it for approval. A lead other than the requester signs off.' },
              { n: '3', title: 'Resolve with a record', text: 'Close it knowing the owner, every decision and the reasons are already on file.' },
            ].map((s) => (
              <div key={s.n} className="flex flex-col items-start">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">{s.n}</span>
                  <h3 className="text-sm font-bold text-slate-900">{s.title}</h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ ROLE ACCESS ═══════════════════ */}
      <section id="access" className="py-20 px-6 bg-[#f8fafc] border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-12">The right access for each person, per team.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Viewer', text: "Sees the team's work and history." },
              { title: 'Member', text: 'Creates, claims, edits and comments.' },
              { title: 'Lead', text: 'Assigns, approves, closes and manages members.' },
              { title: 'Org admin', text: 'Read-only view across every team.' },
            ].map((r) => (
              <div key={r.title} className="border-l-2 border-blue-500 pl-4 py-0.5">
                <h3 className="text-sm font-bold text-slate-900 mb-1">{r.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER BANNER ═══════════════════ */}
      <footer className="bg-[#0B1320] text-white py-14 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 tracking-tight">See what needs attention first.</h2>
            <p className="text-xs sm:text-sm text-slate-400">Sign in to your team's workspace.</p>
          </div>
          <button onClick={handleOpenAuth} className="bg-[#2563eb] hover:bg-blue-600 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition shadow-sm cursor-pointer">Sign in</button>
        </div>
      </footer>

      {/* ═══════════════════ SIGN IN / REGISTER MODAL ═══════════════════ */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={handleCloseModal}>
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {/* Close Button */}
            <button onClick={handleCloseModal} className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" aria-label="Close">
              <X className="w-5 h-5" />
            </button>

            {/* Form Content */}
            <div className="max-h-[90vh] overflow-y-auto p-7 sm:p-8">

              {/* Header + Mode Tabs */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="pr-8">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {mode === 'signin' ? 'Sign in' : 'Create an account'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {mode === 'signin'
                      ? 'Enter your credentials or pick a demo account below.'
                      : 'Register your own email to access all operational tools.'}
                  </p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                  <button type="button" onClick={() => { setMode('signin'); setError(''); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${mode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >Sign In</button>
                  <button type="button" onClick={() => { setMode('register'); setError(''); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >Sign Up</button>
                </div>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="font-medium">{error}</span>
                  </div>
                  {mode === 'signin' && (
                    <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between text-[11.5px]">
                      <span className="text-rose-600">Haven't registered this email yet?</span>
                      <button type="button" onClick={() => { setMode('register'); setError(''); }} className="font-bold text-[#2f5bea] hover:underline cursor-pointer ml-2">Register now →</button>
                    </div>
                  )}
                </div>
              )}

              {/* Auth Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full name</label>
                    <input type="text" required placeholder="e.g. Alex Johnson" value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] focus:ring-1 focus:ring-[#2f5bea]/20" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email address</label>
                  <input type="email" required placeholder={mode === 'signin' ? 'alice@newtonite.test' : 'your.name@company.com'} value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] focus:ring-1 focus:ring-[#2f5bea]/20" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password {mode === 'register' && <span className="text-slate-400 font-normal">(min 8 characters)</span>}
                  </label>
                  <input type="password" required minLength={mode === 'register' ? 8 : 1} placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] focus:ring-1 focus:ring-[#2f5bea]/20" />
                </div>

                {mode === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Default Team Role</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setRole('lead')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer text-xs ${role === 'lead' ? 'border-[#2f5bea] bg-blue-50/60 text-blue-900 font-semibold' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                          <div className="font-semibold">Team Lead</div>
                          <div className="text-[11px] text-slate-500 font-normal">Assign, approve fixes & manage</div>
                        </button>
                        <button type="button" onClick={() => setRole('member')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer text-xs ${role === 'member' ? 'border-[#2f5bea] bg-blue-50/60 text-blue-900 font-semibold' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                          <div className="font-semibold">Team Member</div>
                          <div className="text-[11px] text-slate-500 font-normal">Claim tasks, submit fixes</div>
                        </button>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-slate-700">Company / Workspace</label>
                          <span className="text-[11px] text-slate-400">Optional</span>
                        </div>
                        <input type="text" disabled={Boolean(inviteCode)} placeholder="e.g. Acme Corp" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] disabled:opacity-40" />
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
                        <input type="text" disabled={Boolean(workspaceName)} placeholder="e.g. INV-A93E-B41C" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                          className="w-full font-mono uppercase bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] disabled:opacity-40" />
                      </div>
                    </div>
                  </>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#2f5bea] hover:bg-[#264ecc] text-white rounded-lg text-sm font-semibold flex items-center justify-center space-x-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer">
                  <span>{loading ? (mode === 'register' ? 'Creating account...' : 'Authenticating...') : (mode === 'register' ? 'Create Account & Sign In' : 'Sign in')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Toggle Helper */}
              <div className="mt-5 text-center text-xs text-slate-500">
                {mode === 'signin' ? (
                  <span>Want to use your personal email?{' '}
                    <button type="button" onClick={() => { setMode('register'); setError(''); }} className="text-[#2f5bea] font-semibold hover:underline cursor-pointer">Create an account</button>
                  </span>
                ) : (
                  <span>Already have an account?{' '}
                    <button type="button" onClick={() => { setMode('signin'); setError(''); }} className="text-[#2f5bea] font-semibold hover:underline cursor-pointer">Sign in</button>
                  </span>
                )}
              </div>

              {/* Demo Quick-Login */}
              {mode === 'signin' && (
                <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
                  <div className="text-xs font-medium text-slate-500">
                    Or one-click demo accounts (password: <code className="text-slate-700 font-mono">Password123!</code>):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {demoAccounts.map((acc) => (
                      <button key={acc.email} type="button" onClick={() => handleQuickLogin(acc.email)}
                        className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-[#2f5bea] text-left transition flex items-center space-x-2.5 cursor-pointer shadow-xs">
                        <div className={`w-7 h-7 rounded-full ${acc.color} text-white flex items-center justify-center text-xs font-medium shrink-0`}>{acc.initial}</div>
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
      )}
    </div>
  );
}
