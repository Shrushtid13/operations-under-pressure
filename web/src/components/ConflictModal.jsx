// web/src/components/ConflictModal.jsx
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ConflictModal({ conflictError, userDraft, onOverwrite, onDiscard }) {
  if (!conflictError) return null;

  const currentItem = conflictError.details?.current_item;
  const conflictingFields = conflictError.details?.conflicting_fields || [];
  const assignee = conflictError.details?.assignee;
  const isAlreadyAssigned = conflictError.code === 'ALREADY_ASSIGNED';

  const priorityNames = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low' };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#e2e8f0] rounded-[16px] p-6 w-full max-w-lg shadow-xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isAlreadyAssigned ? 'Already claimed' : 'Version conflict'}
              </h3>
            </div>
          </div>
          <button
            onClick={onDiscard}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {isAlreadyAssigned ? (
          <div className="bg-slate-50 rounded-xl border border-[#e2e8f0] p-4 text-sm space-y-1">
            <div className="text-slate-500 text-xs font-medium">Claimed by</div>
            <div className="font-semibold text-slate-900">
              {assignee?.name || 'Another operator'} ({assignee?.email || 'N/A'})
            </div>
            <div className="text-slate-500 text-xs pt-1">
              The item transitioned to "In progress". Your local draft has been retained.
            </div>
          </div>
        ) : (
          <div className="bg-[#fef3c7] border border-[#fcd34d] rounded-xl p-4 space-y-3">
            {conflictingFields.length > 0 ? (
              conflictingFields.map((field) => {
                const serverVal = currentItem?.[field];
                const userVal = userDraft?.[field];
                const fieldLabel = field.replace(/_/g, ' ');
                const serverDisplay = field === 'priority' ? (priorityNames[serverVal] || serverVal) : String(serverVal || '');
                const userDisplay = field === 'priority' ? (priorityNames[userVal] || userVal) : String(userVal || '');

                return (
                  <div key={field} className="text-sm text-amber-900">
                    <span className="font-semibold">Someone changed {fieldLabel} while you were editing.</span>
                    <br />
                    <span className="text-amber-800">
                      {fieldLabel}: current is <strong>{serverDisplay}</strong>, yours is <strong>{userDisplay}</strong>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-amber-900 font-semibold">
                {conflictError.message || 'The server state has changed since you opened this item.'}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <button
            onClick={onDiscard}
            className="px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white hover:bg-slate-50 text-xs text-slate-700 font-semibold transition cursor-pointer shadow-xs"
          >
            Take theirs
          </button>

          {!isAlreadyAssigned && (
            <button
              onClick={() => onOverwrite(currentItem.version)}
              className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-xs text-white font-semibold transition shadow-xs cursor-pointer"
            >
              Overwrite with mine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
