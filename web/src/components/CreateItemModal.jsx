// web/src/components/CreateItemModal.jsx
import React, { useState } from 'react';
import { AlertCircle, Bell, Calendar, Clock, X } from 'lucide-react';
import { api } from '../api.js';

export function CreateItemModal({ teams = [], selectedTeamId, onClose, onSuccess }) {
  const [teamId, setTeamId] = useState(selectedTeamId || (teams[0]?.id ? String(teams[0].id) : ''));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('incident');
  const [priority, setPriority] = useState('3');
  const [dueAt, setDueAt] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setPresetHours = (hours) => {
    const d = new Date(Date.now() + hours * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setDueAt(local);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !teamId) return;

    setLoading(true);
    setError('');

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      kind,
      priority: parseInt(priority, 10),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      requires_approval: requiresApproval
    };

    try {
      const res = await api.createWorkItem(teamId, payload);
      onSuccess(res);
    } catch (err) {
      setError(err.message || 'Failed to create work item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#e3e8ee] rounded-[16px] p-6 w-full max-w-lg shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e3e8ee] pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">New work item</h3>
            <p className="text-xs text-slate-500">Create an incident, customer issue, or operational task</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
              placeholder="E.g. Card payments failing for EU merchants"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Team</label>
              <select
                required
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key} — {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
              >
                <option value="incident">Incident</option>
                <option value="customer_issue">Customer issue</option>
                <option value="payment">Payment</option>
                <option value="compliance">Compliance</option>
                <option value="task">Task</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
              >
                <option value="4">Critical (P4)</option>
                <option value="3">High (P3)</option>
                <option value="2">Medium (P2)</option>
                <option value="1">Low (P1)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Deadline (Target Due Date)</span>
                </label>
                {dueAt && (
                  <button
                    type="button"
                    onClick={() => setDueAt('')}
                    className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
              />
            </div>
          </div>

          {/* Quick Deadline Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-medium">Quick presets:</span>
            <button
              type="button"
              onClick={() => setPresetHours(4)}
              className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer font-medium transition"
            >
              +4 Hours
            </button>
            <button
              type="button"
              onClick={() => setPresetHours(24)}
              className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer font-medium transition"
            >
              Tomorrow (24h)
            </button>
            <button
              type="button"
              onClick={() => setPresetHours(72)}
              className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer font-medium transition"
            >
              3 Days
            </button>
            <button
              type="button"
              onClick={() => setPresetHours(168)}
              className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer font-medium transition"
            >
              1 Week
            </button>
          </div>

          {/* Automated Reminder Note */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2.5 text-[11px] text-indigo-900 flex items-start gap-2">
            <Bell className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0" />
            <div className="leading-tight">
              <span className="font-semibold text-indigo-950">Automated reminder alerts:</span>
              <span className="text-indigo-800 ml-1">
                Assignees and leads will automatically receive real-time reminder notifications when this deadline approaches (within 24h) and if overdue.
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description (optional)</label>
            <textarea
              rows={3}
              placeholder="Context, symptoms, or reproduction steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-[#e3e8ee] rounded-lg p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#2f5bea]"
            />
          </div>

          <label className="inline-flex items-center space-x-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="w-4 h-4 rounded text-[#2f5bea] focus:ring-0 border-slate-300 cursor-pointer"
            />
            <span className="text-xs font-medium text-slate-700">Requires formal lead approval before resolving</span>
          </label>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#e3e8ee]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#e3e8ee] bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-4 py-2 rounded-lg bg-[#2f5bea] hover:bg-[#264ecc] text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? 'Creating...' : 'Create work item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
