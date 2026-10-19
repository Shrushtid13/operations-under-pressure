// web/src/components/WorkspaceOnboardingView.jsx
import React, { useState } from 'react';
import { Building2, KeyRound, ArrowRight, ShieldCheck, Plus, Sparkles, AlertCircle, LogOut } from 'lucide-react';
import { api } from '../api.js';

export function WorkspaceOnboardingView({ user, onComplete, onLogout, initialCode = '' }) {
  const [activeTab, setActiveTab] = useState(initialCode ? 'join' : 'create'); // 'create' | 'join'
  const [workspaceName, setWorkspaceName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamKey, setTeamKey] = useState('');
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.createWorkspace({
        name: workspaceName.trim(),
        initial_team_name: teamName.trim() || undefined,
        initial_team_key: teamKey.trim() || undefined
      });
      onComplete(res);
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.joinWorkspace(inviteCode.trim().toUpperCase());
      onComplete(res);
    } catch (err) {
      setError(err.message || 'Invalid or expired invitation code');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinDemo = async () => {
    setLoading(true);
    setError('');
    try {
      await api.joinWorkspace('DEMO-NEWTONITE');
      onComplete();
    } catch (err) {
      setError(err.message || 'Unable to join demo');
    } finally {
      setLoading(false);
    }
  };

  const firstName = user?.name?.split(' ')[0] || 'Operator';

  return (
    <div className="min-h-screen bg-[#0B1320] flex flex-col justify-between p-4 sm:p-8 antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between pb-4">
        <div className="flex items-center space-x-2">
          <span className="text-white font-bold text-lg tracking-tight">Operations</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center space-x-1.5 text-xs sm:text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </header>

      {/* Main Centered Box Container */}
      <div className="flex-1 flex items-center justify-center py-6">
        <div className="bg-white border border-slate-200/90 rounded-2xl w-full max-w-2xl shadow-2xl p-8 sm:p-10 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2.5">
            <div className="w-14 h-14 bg-blue-50 text-[#2563eb] rounded-2xl mx-auto flex items-center justify-center shadow-xs">
              <Building2 className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Welcome to Operations, {firstName}
            </h1>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Every workspace in this system is completely private and isolated. Set up your team's workspace or enter an invite code to begin.
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Option Tabs */}
          <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => { setActiveTab('create'); setError(''); }}
              className={`py-3 text-sm font-semibold rounded-lg transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-4 h-4 text-[#2563eb]" />
              <span>Create New Workspace</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('join'); setError(''); }}
              className={`py-3 text-sm font-semibold rounded-lg transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>Enter Invite Code</span>
            </button>
          </div>

          {/* Tab 1: Create Workspace */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreate} className="space-y-5 pt-1">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Workspace / Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g. Acme Corporation, Stripe Ops, Cloudflare SRE"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-[#2563eb] transition"
                />
                <span className="text-xs text-slate-500 mt-1.5 block">
                  All data, incidents, chats, and members will be private to this workspace.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Initial Team Name <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Customer Incidents"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-[#2563eb] transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Team Key <span className="text-slate-400 font-normal">(prefix, optional)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={teamKey}
                    onChange={(e) => setTeamKey(e.target.value.toUpperCase())}
                    placeholder="e.g. OPS, PAY, SRE"
                    className="w-full font-mono uppercase bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-[#2563eb] transition"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl text-xs sm:text-sm text-blue-900 flex items-start space-x-3 leading-relaxed">
                <ShieldCheck className="w-5 h-5 text-[#2563eb] shrink-0 mt-0.5" />
                <span>
                  You will be the <strong>Owner & Team Lead</strong>. You will be able to invite your teammates, configure shifts, and approve fixes.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !workspaceName.trim()}
                className="w-full py-3.5 bg-[#2563eb] hover:bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>{loading ? 'Creating workspace...' : 'Create Workspace & Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Tab 2: Join with Invite Code */}
          {activeTab === 'join' && (
            <form onSubmit={handleJoin} className="space-y-5 pt-1">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Workspace Invitation Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. INV-A93E-B41C"
                  className="w-full font-mono uppercase bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-base text-slate-900 tracking-wider focus:outline-none focus:bg-white focus:border-[#2563eb] transition"
                />
                <span className="text-xs text-slate-500 mt-1.5 block">
                  Enter the invitation code provided by your team lead or workspace owner.
                </span>
              </div>

              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs sm:text-sm text-amber-900 flex items-start space-x-3 leading-relaxed">
                <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Joining via invitation will grant you the role (Lead, Member, or Viewer) assigned by the person who invited you.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !inviteCode.trim()}
                className="w-full py-3.5 bg-[#2563eb] hover:bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>{loading ? 'Verifying code...' : 'Join Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Footer with Logout & Demo Fallback */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-slate-500">
            <button
              type="button"
              onClick={onLogout}
              className="hover:text-slate-800 underline cursor-pointer"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={handleJoinDemo}
              className="hover:text-[#2563eb] flex items-center space-x-1.5 font-medium cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Join Newtonite Demo Workspace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Bottom Credit */}
      <footer className="text-center text-xs text-slate-500 py-2">
        Operations Under Pressure · Newtonite Engineering
      </footer>
    </div>
  );
}
