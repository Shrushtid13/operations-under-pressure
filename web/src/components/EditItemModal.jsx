// web/src/components/EditItemModal.jsx
import React, { useState } from 'react';
import { AlertCircle, Bell, Clock, X } from 'lucide-react';
import { api } from '../api.js';

export function EditItemModal({ item, onClose, onSuccess, onConflict }) {
  const [title, setTitle] = useState(item.title || '');
  const [description, setDescription] = useState(item.description || '');
  const [priority, setPriority] = useState(String(item.priority || 1));
  const [kind, setKind] = useState(item.kind || 'task');
  const [dueAt, setDueAt] = useState(
    item.due_at ? new Date(item.due_at).toISOString().slice(0, 16) : ''
  );

  const setPresetHours = (hours) => {
    const d = new Date(Date.now() + hours * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setDueAt(local);
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Inline conflict state — matches the screenshot's in-modal amber conflict banner
  const [inlineConflict, setInlineConflict] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError('');

    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      priority: parseInt(priority, 10),
      kind,
      due_at: dueAt ? new Date(dueAt).toISOString() : null
    };

    try {
      const res = await api.patchWorkItem(item.id, item.version, fields);
      if (res?.merge?.merged) {
        onSuccess('Saved. Merged with changes made by others.');
      } else {
        onSuccess('Changes saved successfully.');
      }
    } catch (err) {
      if (err.status === 409) {
        // Show inline conflict alert inside the modal (matching reference screenshot)
        setInlineConflict({
          error: err,
          draft: fields
        });
      } else {
        setError(err.message || 'Failed to update work item');
      }
    } finally {
      setLoading(false);
    }
  };

  // Take theirs — discard user's changes, refresh
  const handleTakeTheirs = () => {
    setInlineConflict(null);
    onConflict(inlineConflict.error, null); // signal discard
    onClose();
  };

  // Overwrite with mine — force push user's draft at the server's current version
  const handleOverwrite = async () => {
    const serverVersion = inlineConflict.error?.details?.current_item?.version;
    const draft = inlineConflict.draft;
    setInlineConflict(null);
    setLoading(true);
    try {
      await api.patchWorkItem(item.id, serverVersion, draft);
      onSuccess('Changes forced and overwritten successfully.');
    } catch (err) {
      if (err.status === 409) {
        setInlineConflict({ error: err, draft });
      } else {
        setError(err.message || 'Overwrite failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Derive conflict details for the amber banner
  const conflictFields = inlineConflict?.error?.details?.conflicting_fields || [];
  const currentItem = inlineConflict?.error?.details?.current_item;
  const conflictMessage = inlineConflict?.error?.message || 'The server state has changed.';

  // Priority names for conflict display
  const priorityNames = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low' };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-lg shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Edit details</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inline Conflict Alert Banner (amber — matching screenshot exactly) */}
        {inlineConflict && (
          <div className="bg-[#fef3c7] border border-[#fcd34d] rounded-xl p-4 space-y-3">
            {/* Conflict description */}
            <div className="space-y-1">
              {conflictFields.map((field) => {
                const serverVal = currentItem?.[field];
                const userVal = inlineConflict.draft?.[field];
                const fieldLabel = field === 'priority'
                  ? 'priority'
                  : field.replace(/_/g, ' ');
                const serverDisplay = field === 'priority'
                  ? (priorityNames[serverVal] || serverVal)
                  : String(serverVal || '');
                const userDisplay = field === 'priority'
                  ? (priorityNames[userVal] || userVal)
                  : String(userVal || '');

                return (
                  <div key={field} className="text-sm text-amber-900">
                    <span className="font-semibold">
                      {currentItem?.assignee_name || 'Someone'} changed {fieldLabel} while you were editing.
                    </span>
                    <br />
                    <span className="text-amber-800">
                      {fieldLabel}: current is <strong>{serverDisplay}</strong>, yours is <strong>{userDisplay}</strong>
                    </span>
                  </div>
                );
              })}
              {conflictFields.length === 0 && (
                <div className="text-sm text-amber-900 font-semibold">
                  {conflictMessage}
                </div>
              )}
            </div>

            {/* Action buttons — matching screenshot: [Take theirs] [Overwrite with mine] */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTakeTheirs}
                className="px-3.5 py-1.5 bg-white border border-[#e2e8f0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
              >
                Take theirs
              </button>
              <button
                type="button"
                onClick={handleOverwrite}
                className="px-3.5 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
              >
                Overwrite with mine
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb] shadow-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
              >
                <option value="4">Critical</option>
                <option value="3">High</option>
                <option value="2">Medium</option>
                <option value="1">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
              >
                <option value="incident">Incident</option>
                <option value="customer_issue">Customer issue</option>
                <option value="payment">Payment</option>
                <option value="compliance">Compliance</option>
                <option value="task">Task</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Deadline (Target Due Date)</span>
              </label>
              {dueAt && (
                <button
                  type="button"
                  onClick={() => setDueAt('')}
                  className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer font-medium"
                >
                  Clear deadline
                </button>
              )}
            </div>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
            />
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
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
            {/* Reminder Hint */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 text-[11px] text-indigo-900 flex items-start gap-1.5">
              <Bell className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0" />
              <span>Updating deadline resets alerts. Notifications are sent when within 24h or overdue.</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-[#e2e8f0] rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#2563eb]"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
