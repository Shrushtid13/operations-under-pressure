// web/src/components/ConflictModal.jsx
import React from 'react';
import { AlertTriangle, ArrowRight, RotateCcw, X } from 'lucide-react';

export function ConflictModal({ conflictError, userDraft, onResolve, onDiscard }) {
  if (!conflictError) return null;

  const currentItem = conflictError.details?.current_item;
  const conflictingFields = conflictError.details?.conflicting_fields || [];
  const assignee = conflictError.details?.assignee;
  const isAlreadyAssigned = conflictError.code === 'ALREADY_ASSIGNED';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {isAlreadyAssigned ? 'Incident Claim Race Detected' : 'Concurrent Update Conflict (HTTP 409)'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {conflictError.message || 'Another team member updated this incident while you were working.'}
              </p>
            </div>
          </div>
          <button
            onClick={onDiscard}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-md hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Comparison */}
        {isAlreadyAssigned ? (
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="text-slate-500 font-medium">Current Assigned Owner:</div>
            <div className="font-semibold text-slate-800">
              {assignee?.name || 'Another member'} ({assignee?.email})
            </div>
            <div className="text-slate-500 text-[11px] leading-relaxed">
              The incident state transitioned to "in_progress" by a concurrent request. Your local draft has been safely retained.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-700">
              {conflictingFields.length > 0 ? (
                <span>Field-level changes on the server:</span>
              ) : (
                <span>Server state changed to version v{currentItem?.version}:</span>
              )}
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {conflictingFields.map((field) => (
                <div key={field} className="p-3 bg-amber-50/50 rounded-xl border border-amber-200 text-xs">
                  <div className="font-mono text-[11px] text-amber-800 uppercase font-semibold mb-1">
                    {field}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-slate-600 text-[11px]">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Your Local Draft:</span>
                      <span className="text-slate-800 font-medium break-words">{String(userDraft?.[field] || '')}</span>
                    </div>
                    <div className="bg-amber-100/50 p-2 rounded-lg border border-amber-200">
                      <span className="text-amber-700 block text-[10px] uppercase font-semibold">Server Current Value:</span>
                      <span className="text-amber-900 font-semibold break-words">{String(currentItem?.[field] || '')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            onClick={onDiscard}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 font-medium transition cursor-pointer shadow-sm"
          >
            Discard Draft & Refresh
          </button>

          {!isAlreadyAssigned && (
            <button
              onClick={() => onResolve(currentItem.version)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
            >
              <span>Overwrite with My Draft (v{currentItem.version})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
