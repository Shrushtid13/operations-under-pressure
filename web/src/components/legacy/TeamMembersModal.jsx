// web/src/components/TeamMembersModal.jsx
import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../api.js';

export function TeamMembersModal({ teamId, teamKey, members, onClose, onRefresh }) {
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.addTeamMember(teamId, newEmail.trim(), newRole);
      setNewEmail('');
      setSuccess('Member added / reactivated successfully');
      onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, targetRole) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.updateTeamMemberRole(teamId, userId, targetRole);
      setSuccess('Role updated successfully');
      onRefresh();
    } catch (err) {
      if (err.status === 409 && err.details?.active_items) {
        setError(`Cannot demote member while they hold active work items: ${err.details.active_items.join(', ')}`);
      } else {
        setError(err.message || 'Failed to update role');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Are you sure you want to remove this member from the team?')) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.removeTeamMember(teamId, userId);
      setSuccess('Member removed successfully');
      onRefresh();
    } catch (err) {
      if (err.status === 409 && err.details?.active_items) {
        setError(`Cannot remove member while they hold active work items: ${err.details.active_items.join(', ')}`);
      } else {
        setError(err.message || 'Failed to remove member');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Team Roster & Roles <span className="font-mono text-indigo-600 text-xs">({teamKey})</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* Add Member Form */}
        <form onSubmit={handleAddMember} className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Add or Reactivate Member
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="operator@company.test"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium cursor-pointer"
            >
              <option value="member">Member</option>
              <option value="lead">Lead</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={loading || !newEmail.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-50 transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </form>

        {/* Members List */}
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {members?.map((m) => (
            <div
              key={m.id}
              className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs hover:border-slate-300 transition"
            >
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center text-white">
                    {m.name?.[0]?.toUpperCase()}
                  </div>
                  <span>{m.name}</span>
                  {m.role === 'lead' && <Shield className="w-3.5 h-3.5 text-amber-500" title="Team Lead" />}
                </div>
                <div className="text-[11px] text-slate-500 pl-8">{m.email} · <span className="capitalize font-medium">{m.role}</span></div>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  disabled={loading}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-medium capitalize cursor-pointer focus:outline-none focus:border-indigo-500"
                >
                  <option value="lead">Lead</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>

                <button
                  onClick={() => handleRemoveMember(m.id)}
                  disabled={loading}
                  title="Remove from team"
                  className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
