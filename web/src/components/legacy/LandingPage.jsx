// web/src/components/LandingPage.jsx
import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  FileCheck2,
  GitBranch,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Zap
} from 'lucide-react';
import { LoginView } from './LoginView.jsx';

export function LandingPage({ onLoginSuccess }) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDemoUser, setSelectedDemoUser] = useState(null);

  const handleOpenAuth = (demoEmail = null) => {
    setSelectedDemoUser(demoEmail);
    setShowAuthModal(true);
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-zinc-100 font-sans selection:bg-cyan-500/20 selection:text-cyan-300 relative overflow-x-hidden">
      {/* Background Subtle Ambient Glow & Architectural Grid */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[550px] bg-gradient-to-b from-cyan-500/12 via-teal-500/5 to-transparent blur-3xl opacity-70"></div>
        <div className="absolute top-[350px] right-[-10%] w-[500px] h-[500px] bg-emerald-500/8 blur-[130px] rounded-full"></div>
        <div className="absolute top-[600px] left-[-10%] w-[500px] h-[500px] bg-blue-600/8 blur-[130px] rounded-full"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1417210a_1px,transparent_1px),linear-gradient(to_bottom,#1417210a_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      {/* Glass Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#08090d]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-cyan-500/25">
              Ω
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                Newtonite <span className="text-zinc-400 font-normal">| Operations</span>
              </span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center space-x-7 text-xs font-medium text-zinc-400">
            <a href="#cockpit" className="hover:text-cyan-400 transition">Operations Cockpit</a>
            <a href="#concurrency" className="hover:text-cyan-400 transition">Concurrency Architecture</a>
            <a href="#invariants" className="hover:text-cyan-400 transition">Correctness Invariants</a>
            <a href="#personas" className="hover:text-cyan-400 transition">Role Personas</a>
          </nav>

          {/* Status & Sign In Button */}
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-xs bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-zinc-300 text-[11px] font-mono">Engine Live · Real-time</span>
            </div>

            <button
              onClick={() => handleOpenAuth()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition shadow-lg shadow-cyan-500/20 flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-24 px-6 max-w-7xl mx-auto text-center">
        {/* Subtle pill tag */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/30 text-cyan-300 text-xs font-medium mb-6 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Newtonite High-Concurrency Incident & Work Coordination</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white max-w-4xl mx-auto leading-[1.12]">
          Master Operational Pressure. <br />
          <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
            Coordinate Critical Work Without Chaos.
          </span>
        </h1>

        {/* Subhead */}
        <p className="mt-5 text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Engineered for high-volume engineering teams, payment discrepancies, production incidents,
          and compliance workflows. Zero lost updates, immutable audit trails, and mathematically proven concurrency.
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => handleOpenAuth()}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-zinc-950 font-semibold text-xs sm:text-sm shadow-xl shadow-cyan-500/25 flex items-center space-x-2 transition cursor-pointer"
          >
            <span>Launch Operations Console</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <a
            href="#concurrency"
            className="px-6 py-3 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 font-medium text-xs sm:text-sm transition flex items-center space-x-2"
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Architecture & Invariants</span>
          </a>
        </div>

        {/* Metrics Ticker */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto pt-8 border-t border-zinc-800/60 text-left">
          <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80">
            <div className="text-xl font-bold text-white font-mono">0.0%</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Lost updates under parallel load</div>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80">
            <div className="text-xl font-bold text-cyan-400 font-mono">100%</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Immutable audit completeness</div>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80">
            <div className="text-xl font-bold text-teal-400 font-mono">&lt; 1 ms</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Gapless number allocation</div>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80">
            <div className="text-xl font-bold text-emerald-400 font-mono">At-Least-Once</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Transactional outbox reliability</div>
          </div>
        </div>

        {/* ----------------- Visual Cockpit with Floating Cards ----------------- */}
        <div id="cockpit" className="mt-16 relative max-w-6xl mx-auto">
          {/* Ambient backlight glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-600/10 via-teal-500/10 to-emerald-500/10 rounded-3xl blur-2xl transform scale-95 opacity-60"></div>

          {/* Central Monitor Frame */}
          <div className="relative bg-zinc-950/90 rounded-2xl border border-zinc-800 shadow-2xl p-2 sm:p-4 backdrop-blur-xl ring-1 ring-white/10">
            {/* Monitor Header Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/80 rounded-t-xl text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
                <span className="font-mono text-[11px] text-zinc-400 ml-2">operations.newtonite.internal</span>
              </div>
              <div className="flex items-center space-x-2 text-zinc-400 text-[11px]">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>LISTEN item_changes active</span>
              </div>
            </div>

            {/* Inner Dashboard Cockpit Preview */}
            <div className="p-4 sm:p-6 bg-zinc-950/70 text-left space-y-5 rounded-b-xl">
              {/* Dashboard Top bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/60">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <span>Operations Center</span>
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-800/60 px-2 py-0.5 rounded">
                      TEAM: OPS
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Active coordinate dashboard for incidents & critical tasks</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Alice Walker (Lead)</span>
                  </div>
                </div>
              </div>

              {/* Cockpit Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] uppercase font-semibold text-zinc-400">Open / Claimable</div>
                  <div className="text-xl font-bold text-cyan-400 font-mono mt-1">1</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Unowned work needing lead or member</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] uppercase font-semibold text-zinc-400">In Progress</div>
                  <div className="text-xl font-bold text-teal-400 font-mono mt-1">2</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Actively handled by assignees</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] uppercase font-semibold text-zinc-400">Pending Approval</div>
                  <div className="text-xl font-bold text-amber-400 font-mono mt-1">1</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Separation of duties guard enabled</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <div className="text-[10px] uppercase font-semibold text-zinc-400">Overdue SLA</div>
                  <div className="text-xl font-bold text-rose-400 font-mono mt-1">1</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Surfaced dynamically in attention query</div>
                </div>
              </div>

              {/* Mocked Item Table */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden text-xs">
                <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between text-zinc-400 text-[11px] font-medium bg-zinc-900/80">
                  <span>ITEM KEY & TITLE</span>
                  <span>STATUS & ASSIGNEE</span>
                </div>
                <div className="divide-y divide-zinc-800/60 font-sans">
                  <div className="p-3 flex items-center justify-between hover:bg-zinc-800/30 transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                          OPS-1
                        </span>
                        <span className="text-[10px] font-semibold text-rose-300 bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.5 rounded">
                          P4 Urgent
                        </span>
                        <span className="font-medium text-zinc-100">High latency spike on checkout API in eu-west-1</span>
                      </div>
                      <div className="text-[11px] text-zinc-400">Investigating connection pool saturation · Charlie Green</div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-950/60 border border-teal-800/60 text-teal-300">
                        In Progress
                      </span>
                    </div>
                  </div>

                  <div className="p-3 flex items-center justify-between hover:bg-zinc-800/30 transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                          PAY-2
                        </span>
                        <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded">
                          P3 High
                        </span>
                        <span className="font-medium text-zinc-100">Unreconciled merchant payout batch #8912</span>
                      </div>
                      <div className="text-[11px] text-zinc-400">Discrepancy €14,250 held pending sign-off · Charlie Green</div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-950/60 border border-amber-800/60 text-amber-300">
                        Pending Approval
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating UI Card 1 (Top Left): Incident Notification */}
          <div className="hidden lg:block absolute -top-8 -left-8 w-72 p-3.5 rounded-xl bg-zinc-900/90 border border-cyan-500/40 shadow-2xl backdrop-blur-xl text-left transform -rotate-1 hover:rotate-0 transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-800 px-2 py-0.5 rounded">
                Live Incident
              </span>
              <span className="text-[10px] text-zinc-500">Just now</span>
            </div>
            <div className="text-xs font-semibold text-zinc-100">Authentication token validation failing for user sessions</div>
            <div className="mt-2 text-[11px] text-zinc-400 flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Michael Turner
              </span>
              <span className="text-emerald-400 font-medium">Claimed (v2)</span>
            </div>
          </div>

          {/* Floating UI Card 2 (Top Right): Real-time Circular Telemetry */}
          <div className="hidden lg:block absolute -top-10 -right-8 w-64 p-4 rounded-xl bg-zinc-900/90 border border-teal-500/40 shadow-2xl backdrop-blur-xl text-left transform rotate-2 hover:rotate-0 transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-200">Incident Distribution</span>
              <Activity className="w-3.5 h-3.5 text-teal-400" />
            </div>
            {/* Donut representation */}
            <div className="flex items-center space-x-4 my-2">
              <div className="relative w-14 h-14 flex items-center justify-center">
                <svg className="w-14 h-14 transform -rotate-90">
                  <circle cx="28" cy="28" r="22" stroke="currentColor" strokeWidth="5" className="text-zinc-800" fill="transparent" />
                  <circle cx="28" cy="28" r="22" stroke="currentColor" strokeWidth="5" className="text-cyan-400" strokeDasharray="138" strokeDashoffset="45" fill="transparent" />
                  <circle cx="28" cy="28" r="22" stroke="currentColor" strokeWidth="5" className="text-emerald-400" strokeDasharray="138" strokeDashoffset="100" fill="transparent" />
                </svg>
                <span className="absolute text-[10px] font-mono font-bold text-white">99%</span>
              </div>
              <div className="text-[10px] space-y-1 text-zinc-400 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span>Investigating: 38%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Resolved: 52%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating UI Card 3 (Bottom Right): Separation of Duties Pill */}
          <div className="hidden lg:block absolute -bottom-6 -right-6 w-72 p-3.5 rounded-xl bg-zinc-900/90 border border-emerald-500/40 shadow-2xl backdrop-blur-xl text-left transform rotate-1 hover:rotate-0 transition">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-200">Mean Time to Resolve</span>
              <span className="text-emerald-400 font-bold font-mono">38m (-14%)</span>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400 space-y-1 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-1 text-cyan-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Separation of Duties Enforced</span>
              </div>
              <div className="text-zinc-500 text-[10px]">
                Approver ≠ Requester enforced in PostgreSQL atomic UPDATE
              </div>
            </div>
          </div>

          {/* Floating UI Card 4 (Bottom Left): Concurrency Check */}
          <div className="hidden lg:block absolute -bottom-8 -left-6 w-64 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80 shadow-2xl backdrop-blur-xl text-left transform -rotate-2 hover:rotate-0 transition">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-100">
              <GitBranch className="w-4 h-4 text-cyan-400" />
              <span>Transparent Auto-Merge</span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Disjoint PATCH updates (Title vs Priority) merge automatically without false 409 conflicts.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------- The Four Core Architectural Invariants ----------------- */}
      <section id="concurrency" className="py-20 px-6 max-w-7xl mx-auto border-t border-zinc-800/80">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase">
            Built for Correctness Under Pressure
          </h2>
          <h3 className="text-3xl font-bold tracking-tight text-white mt-2">
            Beyond Simple CRUD: Hard Distributed Guarantees
          </h3>
          <p className="text-sm text-zinc-400 mt-3">
            Every critical invariant is enforced directly inside single database transactions and verified against real PostgreSQL load.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
          {/* Invariant 1 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-cyan-500/40 transition group">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-105 transition">
              <Lock className="w-5 h-5" />
            </div>
            <h4 className="text-base font-semibold text-zinc-100">Race-Condition Free Claims</h4>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              When 20 operators simultaneously attempt to claim an incident, atomic PostgreSQL conditional updates (<code className="text-cyan-300">WHERE status='open' AND assignee_id IS NULL</code>) guarantee exactly one winner while others receive structured 409 notifications.
            </p>
          </div>

          {/* Invariant 2 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-teal-500/40 transition group">
            <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-800/60 flex items-center justify-center text-teal-400 mb-4 group-hover:scale-105 transition">
              <GitBranch className="w-5 h-5" />
            </div>
            <h4 className="text-base font-semibold text-zinc-100">Field-Level Stale Merge</h4>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Users viewing older versions can still save edits if concurrent changes touched different fields. Conflicting changes to the same field halt cleanly with current server state, protecting user drafts.
            </p>
          </div>

          {/* Invariant 3 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-emerald-500/40 transition group">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-105 transition">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h4 className="text-base font-semibold text-zinc-100">Idempotency Protocol</h4>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Every mutating intent requires an <code className="text-emerald-300">Idempotency-Key</code>. Network timeouts replaying the identical request return the committed response verbatim without re-evaluating state or generating duplicate side-effects.
            </p>
          </div>

          {/* Invariant 4 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-indigo-500/40 transition group">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-105 transition">
              <Shield className="w-5 h-5" />
            </div>
            <h4 className="text-base font-semibold text-zinc-100">Immutable Audit Trail</h4>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              State updates, append-only history events, and outbox notification intents commit atomically. Triggers and restricted database role grants prevent any update or delete of historical records.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------- Persona Sandbox & Quick Test Access ----------------- */}
      <section id="personas" className="py-20 px-6 max-w-7xl mx-auto border-t border-zinc-800/80">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase">
            Test the Multi-Role Model
          </h2>
          <h3 className="text-3xl font-bold tracking-tight text-white mt-2">
            One-Click Role Personas
          </h3>
          <p className="text-sm text-zinc-400 mt-3">
            Experience role boundaries, separation of duties, and team authorization directly in the interactive console.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <button
            onClick={() => handleOpenAuth('alice@newtonite.test')}
            className="p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-cyan-500/50 transition text-left cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-300 font-bold text-xs mb-3 group-hover:scale-110 transition">
              A
            </div>
            <div className="font-semibold text-sm text-zinc-100">Alice Walker</div>
            <div className="text-xs text-cyan-400 font-medium mt-0.5">Team Lead</div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Full authority: claim, assign, transition, approve requests, and manage team members.
            </p>
          </button>

          <button
            onClick={() => handleOpenAuth('bob@newtonite.test')}
            className="p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-teal-500/50 transition text-left cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-lg bg-teal-950 border border-teal-800 flex items-center justify-center text-teal-300 font-bold text-xs mb-3 group-hover:scale-110 transition">
              B
            </div>
            <div className="font-semibold text-sm text-zinc-100">Bob Vance</div>
            <div className="text-xs text-teal-400 font-medium mt-0.5">Team Lead #2</div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Second lead to demonstrate separation of duties when reviewing and approving requests.
            </p>
          </button>

          <button
            onClick={() => handleOpenAuth('charlie@newtonite.test')}
            className="p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 transition text-left cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-300 font-bold text-xs mb-3 group-hover:scale-110 transition">
              C
            </div>
            <div className="font-semibold text-sm text-zinc-100">Charlie Green</div>
            <div className="text-xs text-emerald-400 font-medium mt-0.5">Active Member</div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Can create, claim responsibility, release own work, edit fields, and request formal approvals.
            </p>
          </button>

          <button
            onClick={() => handleOpenAuth('dana@newtonite.test')}
            className="p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/50 transition text-left cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-300 font-bold text-xs mb-3 group-hover:scale-110 transition">
              D
            </div>
            <div className="font-semibold text-sm text-zinc-100">Dana Scott</div>
            <div className="text-xs text-amber-400 font-medium mt-0.5">Viewer Role</div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Read-only member. Any mutation attempt triggers database-backed 403 Forbidden checks.
            </p>
          </button>

          <button
            onClick={() => handleOpenAuth('admin@newtonite.test')}
            className="p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-indigo-500/50 transition text-left cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-300 font-bold text-xs mb-3 group-hover:scale-110 transition">
              E
            </div>
            <div className="font-semibold text-sm text-zinc-100">Eve Admin</div>
            <div className="text-xs text-indigo-400 font-medium mt-0.5">Org Admin</div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Global read-only oversight across all company teams without write access to non-member teams.
            </p>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950/60 py-10 px-6 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-zinc-300">Newtonite Software Engineering Challenge</span>
            <span>— Operations Under Pressure</span>
          </div>
          <div className="flex items-center space-x-6 text-zinc-400">
            <span>Fastify 5</span>
            <span>PostgreSQL 16</span>
            <span>React 19 & Vite</span>
            <span>TanStack Query</span>
          </div>
        </div>
      </footer>

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 z-50 text-zinc-400 hover:text-white p-2"
            >
              ✕
            </button>
            <LoginView
              initialEmail={selectedDemoUser}
              onLoginSuccess={onLoginSuccess}
            />
          </div>
        </div>
      )}
    </div>
  );
}
