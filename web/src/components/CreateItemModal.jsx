// web/src/components/CreateItemModal.jsx
import React, { useState } from 'react';
import { AlertCircle, HelpCircle, Plus, X } from 'lucide-react';
import { api } from '../api.js';

export function CreateItemModal({ teamId, teamKey, onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('incident');
  const [priority, setPriority] = useState(3);
  const [dueDate, setDueDate] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        kind,
        priority: Number(priority),
        due_at: dueDate ? new Date(dueDate).toISOString() : null,
        requires_approval: requiresApproval
      };

      await api.createWorkItem(teamId, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create work item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Create Operational Incident</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Unit: <span className="font-mono text-indigo-600 font-bold">{teamKey}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Incident Title / Subject <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Increased error rate on checkout API"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Operational Context & Notes
            </label>
            <textarea
              rows={3}
              maxLength={10000}
              placeholder="Incident symptoms, impact, initial error traces..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono text-xs transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Classification</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 capitalize cursor-pointer shadow-sm"
              >
                <option value="incident">Incident</option>
                <option value="customer_issue">Customer Issue</option>
                <option value="payment">Payment Alert</option>
                <option value="compliance">Compliance</option>
                <option value="task">Operational Task</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Severity / Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
              >
                <option value={4}>P4 — Critical</option>
                <option value={3}>P3 — High</option>
                <option value={2}>P2 — Medium</option>
                <option value={1}>P1 — Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target SLA Date</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-700 select-none font-semibold">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Requires Lead Sign-Off</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50 transition shadow-sm cursor-pointer"
            >
              {loading ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
