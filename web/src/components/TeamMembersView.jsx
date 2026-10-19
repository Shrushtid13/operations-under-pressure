// web/src/components/TeamMembersView.jsx
import React, { useState } from 'react';
import { AlertCircle, Check, Copy, KeyRound, Link, Plus, RefreshCw, Trash2, UserCheck, Users } from 'lucide-react';
import { api } from '../api.js';

export function TeamMembersView({
  teams = [],
  selectedTeamId,
  onSelectTeam,
  members = [],
  isLoading,
  currentUser,
  onRefresh
}) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('member');

  // Invitation state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);

  const currentTeam = teams.find((t) => String(t.id) === String(selectedTeamId)) || teams[0];
  const userRole = currentTeam?.role || (currentUser?.is_org_admin ? 'org_admin' : 'viewer');
  const isLead = userRole === 'lead' || currentUser?.is_org_admin;

  // Add Member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newEmail.trim() || !currentTeam) return;

    setLoading(true);
    setActionError('');

    try {
      await api.addTeamMember(currentTeam.id, newEmail.trim(), newRole);
      setNewEmail('');
      setIsAddOpen(false);
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  // Generate Invitation Code
  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    if (!currentTeam) return;

    setLoading(true);
    setActionError('');

    try {
      const wsId = currentTeam.workspace_id || (currentUser?.workspaces?.[0]?.id) || '1';
      const res = await api.createInvitation(wsId, {
        role: inviteRole,
        team_id: currentTeam.id,
        email: inviteEmail.trim() || undefined
      });
      setGeneratedInvite(res);
    } catch (err) {
      setActionError(err.message || 'Failed to generate invitation code');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  // Change Role
  const handleChangeRole = async (userId, role) => {
    setActionError('');
    try {
      await api.updateTeamMemberRole(currentTeam.id, userId, role);
      onRefresh();
    } catch (err) {
      if (err.code === 'MEMBER_HAS_ACTIVE_ITEMS') {
        const items = err.details?.active_items?.join(', ') || '';
        setActionError(`Cannot demote member: they have active items (${items}). Reassign or complete their items first.`);
      } else if (err.code === 'LAST_LEAD') {
        setActionError('Cannot demote the last remaining lead of this team.');
      } else {
        setActionError(err.message || 'Failed to change role');
      }
    }
  };

  // Remove Member
  const handleRemoveMember = async (userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this team?`)) return;

    setActionError('');
    try {
      await api.removeTeamMember(currentTeam.id, userId);
      onRefresh();
    } catch (err) {
      if (err.code === 'MEMBER_HAS_ACTIVE_ITEMS') {
        const items = err.details?.active_items?.join(', ') || '';
        setActionError(`Cannot remove member: they have active items (${items}). Reassign or complete their items first.`);
      } else if (err.code === 'LAST_LEAD') {
        setActionError('Cannot remove the last remaining lead of this team.');
      } else {
        setActionError(err.message || 'Failed to remove member');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-slate-900 tracking-tight leading-none">
            Team members
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Manage membership, permissions, and roles for {currentTeam?.name || 'team'}.
          </p>
        </div>

        {/* Team Selector & Add Button */}
        <div className="flex items-center space-x-3">
          {teams.length > 1 && (
            <select
              value={selectedTeamId || currentTeam?.id || ''}
              onChange={(e) => onSelectTeam(e.target.value)}
              className="bg-white border border-[#e3e8ee] text-slate-700 text-sm font-medium rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#2f5bea] cursor-pointer shadow-xs"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} — {t.name}
                </option>
              ))}
            </select>
          )}

          {isLead && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setIsInviteOpen(true);
                  setGeneratedInvite(null);
                  setCopiedCode(false);
                  setCopiedLink(false);
                  setActionError('');
                }}
                className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2563eb] border border-blue-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition shadow-xs cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Invite teammate</span>
              </button>

              <button
                onClick={() => setIsAddOpen(true)}
                className="px-3.5 py-1.5 bg-[#2f5bea] hover:bg-[#264ecc] text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add member</span>
              </button>
            </div>
          )}

          <button
            onClick={onRefresh}
            className="p-1.5 bg-white border border-[#e3e8ee] hover:bg-slate-50 text-slate-600 rounded-lg cursor-pointer"
            title="Refresh members"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Banner with plain-word server error mappings */}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Members Table Card */}
      <div className="bg-white border border-[#e3e8ee] rounded-[12px] overflow-hidden shadow-xs">
        {isLoading && (
          <div className="p-8 text-center text-sm text-slate-400">
            Loading team roster...
          </div>
        )}

        {!isLoading && members.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No active members found in this team.
          </div>
        )}

        {!isLoading && members.length > 0 && (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#e3e8ee] bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Role</th>
                {isLead && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ee]">
              {members.map((m) => {
                const isSelf = String(m.id) === String(currentUser?.id);
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-medium text-xs">
                          {m.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{m.name}</span>
                            {isSelf && (
                              <span className="text-[11px] text-slate-400 font-normal">(you)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {isLead ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.id, e.target.value)}
                          className="bg-white border border-[#e3e8ee] text-xs font-medium text-slate-700 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#2f5bea] cursor-pointer"
                        >
                          <option value="lead">Lead</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="capitalize text-slate-700 font-medium">
                          {m.role}
                        </span>
                      )}
                    </td>

                    {isLead && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleRemoveMember(m.id, m.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded cursor-pointer"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Member Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e3e8ee] rounded-[16px] p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Add team member</h3>
            <p className="text-xs text-slate-500">
              Enter the email of an existing user to add or reactivate in this team.
            </p>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email address</label>
                <input
                  type="email"
                  required
                  placeholder="charlie@newtonite.test"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
                >
                  <option value="member">Member (can claim, create, edit, comment)</option>
                  <option value="viewer">Viewer (read-only access)</option>
                  <option value="lead">Lead (can assign, approve, manage members)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#e3e8ee]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3.5 py-1.5 bg-white border border-[#e3e8ee] hover:bg-slate-50 text-xs font-medium text-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !newEmail.trim()}
                  className="px-3.5 py-1.5 bg-[#2f5bea] hover:bg-[#264ecc] text-white text-xs font-semibold rounded-lg disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {loading ? 'Adding...' : 'Add member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Teammate Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e3e8ee] rounded-[16px] p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563eb] flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Invite teammate</h3>
                  <p className="text-xs text-slate-500">Generate an invitation code for {currentTeam?.name || 'this team'}.</p>
                </div>
              </div>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{actionError}</span>
              </div>
            )}

            {!generatedInvite ? (
              <form onSubmit={handleGenerateInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Role in team</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
                  >
                    <option value="member">Member — Claim tasks, submit fixes & attach files</option>
                    <option value="lead">Lead — Assign tasks, approve fixes & manage members</option>
                    <option value="viewer">Viewer — Read-only access to items & history</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-700">Restrict to email (optional)</label>
                    <span className="text-[11px] text-slate-400">Optional</span>
                  </div>
                  <input
                    type="email"
                    placeholder="e.g. colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Leave blank to allow any colleague with the code to join.
                  </span>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-[#e3e8ee]">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-3.5 py-1.5 bg-white border border-[#e3e8ee] hover:bg-slate-50 text-xs font-medium text-slate-700 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg disabled:opacity-50 cursor-pointer shadow-xs flex items-center space-x-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{loading ? 'Generating...' : 'Generate Invite Code'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Invitation Code</span>
                  <div className="text-2xl font-mono font-bold tracking-widest text-[#2563eb]">
                    {generatedInvite.code}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Role: <strong className="text-slate-800 capitalize">{generatedInvite.role}</strong> · Valid for 7 days
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedInvite.code, 'code')}
                    className="flex-1 py-2 px-3 bg-white border border-[#e3e8ee] hover:border-[#2563eb] text-slate-800 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-xs"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                    <span>{copiedCode ? 'Code Copied!' : 'Copy Code'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${window.location.origin}/#/join/${generatedInvite.code}`, 'link')}
                    className="flex-1 py-2 px-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-xs"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-white" /> : <Link className="w-4 h-4 text-blue-200" />}
                    <span>{copiedLink ? 'Link Copied!' : 'Copy Direct Link'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                  Share this code or link with your colleague. When they sign up or enter the code on their onboarding screen, they will automatically join <strong>{currentTeam?.name}</strong> in this private workspace.
                </p>

                <div className="pt-2 border-t border-[#e3e8ee] flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer shadow-xs"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
