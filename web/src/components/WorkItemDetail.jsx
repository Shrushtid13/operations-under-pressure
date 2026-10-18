// web/src/components/WorkItemDetail.jsx
import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Edit2,
  FileCheck2,
  Lock,
  MessageSquare,
  PlayCircle,
  Send,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
  XCircle
} from 'lucide-react';
import { api } from '../api.js';

export function WorkItemDetail({
  item,
  events,
  currentUser,
  teamMembers,
  onBack,
  onRefresh,
  onConflict
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDescription, setDraftDescription] = useState(item.description || '');
  const [draftPriority, setDraftPriority] = useState(item.priority);

  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Modals for actions requiring parameters
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [assignReason, setAssignReason] = useState('');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveReason, setApproveReason] = useState('');

  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Effective user role in item's team
  const userMembership = currentUser?.teams?.find((t) => String(t.id) === String(item.team_id));
  const userRole = userMembership?.role || (currentUser?.is_org_admin ? 'org_admin' : 'viewer');
  const isLead = userRole === 'lead';
  const isMember = userRole === 'member' || userRole === 'lead';
  const isAssignee = item.assignee_id && String(item.assignee_id) === String(currentUser.id);
  const isRequester = item.approval_requested_by && String(item.approval_requested_by) === String(currentUser.id);

  // Execute standard action with conflict handling
  const handleAction = async (actionFn) => {
    setActionError('');
    setActionLoading(true);
    try {
      await actionFn();
      onRefresh();
    } catch (err) {
      if (err.status === 409) {
        onConflict(err, { title: draftTitle, description: draftDescription, priority: draftPriority });
      } else {
        setActionError(err.message || 'Action failed');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    await handleAction(async () => {
      await api.patchWorkItem(item.id, item.version, {
        title: draftTitle,
        description: draftDescription,
        priority: draftPriority
      });
      setIsEditing(false);
    });
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      await api.addComment(item.id, commentText);
      setCommentText('');
      onRefresh();
    } catch (err) {
      setActionError(err.message || 'Failed to post comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar / Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Work Items</span>
        </button>

        <div className="flex items-center space-x-3 text-xs">
          <span className="font-mono text-zinc-400">Version {item.version}</span>
          <span className="text-zinc-600">|</span>
          <span className="font-mono text-zinc-400">Events: {item.event_seq}</span>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-zinc-400 hover:text-zinc-200">
            ×
          </button>
        </div>
      )}

      {/* Main Item Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-zinc-800">
          {/* Left: Metadata & Title */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                {item.item_key}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full capitalize bg-zinc-800 text-zinc-200 border border-zinc-700">
                {item.kind.replace('_', ' ')}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                item.status === 'in_progress' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' :
                item.status === 'pending_approval' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                item.status === 'resolved' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}>
                {item.status.replace('_', ' ')}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                P{item.priority}
              </span>
              {item.requires_approval && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800">
                  Approval Required
                </span>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3 pt-2">
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <textarea
                  rows={4}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  placeholder="Operational context and details..."
                />
                <div className="flex items-center space-x-3">
                  <label className="text-xs text-zinc-400">Priority:</label>
                  <select
                    value={draftPriority}
                    onChange={(e) => setDraftPriority(Number(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1"
                  >
                    <option value={1}>P1 - Low</option>
                    <option value={2}>P2 - Medium</option>
                    <option value={3}>P3 - High</option>
                    <option value={4}>P4 - Urgent</option>
                  </select>
                </div>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <h1 className="text-lg font-semibold text-zinc-100">{item.title}</h1>
                  {isMember && item.status !== 'closed' && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center space-x-1 p-1 hover:bg-zinc-800 rounded transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-zinc-300 mt-2 whitespace-pre-wrap leading-relaxed font-sans bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/80">
                    {item.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Operational Status & Next Action Callout */}
          <div className="lg:w-72 bg-zinc-950/60 p-4 rounded-lg border border-zinc-800/80 space-y-3">
            <div>
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Next Attention Required
              </div>
              <div className="text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-800/40 p-2.5 rounded flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{item.next_action || 'No immediate action'}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-zinc-400 pt-1 border-t border-zinc-800">
              <div className="flex justify-between">
                <span>Assignee:</span>
                <span className="font-medium text-zinc-200">{item.assignee_name || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between">
                <span>Created by:</span>
                <span className="text-zinc-300">{item.created_by_name}</span>
              </div>
              {item.approval_requested_by_name && (
                <div className="flex justify-between text-purple-300">
                  <span>Sign-off requested by:</span>
                  <span>{item.approval_requested_by_name}</span>
                </div>
              )}
              {item.due_at && (
                <div className={`flex justify-between ${item.is_overdue ? 'text-red-400 font-semibold' : ''}`}>
                  <span>Due:</span>
                  <span>{new Date(item.due_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="pt-4 flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Claim Button */}
          {item.status === 'open' && isMember && (
            <button
              onClick={() => handleAction(() => api.claimWorkItem(item.id))}
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition shadow"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Claim Responsibility</span>
            </button>
          )}

          {/* Release Button */}
          {item.status === 'in_progress' && isAssignee && (
            <button
              onClick={() => handleAction(() => api.releaseWorkItem(item.id, item.version))}
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-zinc-700 transition"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Release Assignment</span>
            </button>
          )}

          {/* Assign (Lead only) */}
          {isLead && item.status !== 'closed' && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-zinc-700 transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Assign to Member</span>
            </button>
          )}

          {/* Request Approval */}
          {item.status === 'in_progress' && item.requires_approval && isAssignee && (
            <button
              onClick={() =>
                handleAction(() =>
                  api.transitionWorkItem(item.id, 'request_approval', item.version)
                )
              }
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition shadow"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Request Lead Sign-Off</span>
            </button>
          )}

          {/* Approve / Reject (Lead only, separation of duties enforced!) */}
          {item.status === 'pending_approval' && isLead && (
            <>
              {isRequester ? (
                <div className="flex items-center space-x-1 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 rounded-lg">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Separation of duties: Another lead must sign off</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowApproveModal(true)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="px-3.5 py-1.5 bg-red-950 hover:bg-red-900 border border-red-700 text-red-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </>
              )}
            </>
          )}

          {/* Resolve (If no approval needed) */}
          {item.status === 'in_progress' && !item.requires_approval && (isAssignee || isLead) && (
            <button
              onClick={() =>
                handleAction(() =>
                  api.transitionWorkItem(item.id, 'resolve', item.version)
                )
              }
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition shadow"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark as Resolved</span>
            </button>
          )}

          {/* Close (Terminal) */}
          {item.status === 'resolved' && isLead && (
            <button
              onClick={() =>
                handleAction(() =>
                  api.transitionWorkItem(item.id, 'close', item.version)
                )
              }
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-zinc-700 transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Close Permanently</span>
            </button>
          )}

          {/* Reopen */}
          {item.status === 'resolved' && isLead && (
            <button
              onClick={() =>
                handleAction(() =>
                  api.transitionWorkItem(item.id, 'reopen', item.version)
                )
              }
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 border border-zinc-700 transition"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Reopen Work</span>
            </button>
          )}
        </div>
      </div>

      {/* Activity Timeline and Comments */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center space-x-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <span>Audit Trail & Activity Timeline</span>
        </h2>

        {/* Comment Box */}
        {isMember && (
          <form onSubmit={handleCommentSubmit} className="space-y-2">
            <textarea
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add an operational note or progress update..."
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                <span>{isSubmittingComment ? 'Posting...' : 'Post Note'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Events List */}
        <div className="space-y-3 pt-2">
          {events?.map((ev) => {
            const isComment = ev.type === 'comment_added';
            const payload = ev.payload || {};

            return (
              <div
                key={ev.id}
                className={`p-3.5 rounded-lg border text-xs ${
                  isComment
                    ? 'bg-zinc-800/40 border-zinc-800'
                    : 'bg-zinc-950/40 border-zinc-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-zinc-200">{ev.actor_name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                      ev.type === 'approved' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      ev.type === 'rejected' ? 'bg-red-950 text-red-400 border border-red-800' :
                      ev.type === 'assigned' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {ev.type.replace('_', ' ')}
                    </span>
                    {ev.item_version && (
                      <span className="text-[10px] text-zinc-500 font-mono">v{ev.item_version}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {new Date(ev.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {isComment ? (
                  <p className="text-zinc-300 whitespace-pre-wrap">{payload.comment}</p>
                ) : (
                  <div className="text-zinc-400 space-y-1">
                    {payload.reason && (
                      <div className="p-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 italic">
                        "{payload.reason}"
                      </div>
                    )}
                    {payload.changes && (
                      <div className="font-mono text-[11px] text-zinc-400">
                        {Object.entries(payload.changes).map(([k, diff]) => (
                          <div key={k}>
                            Changed <span className="text-zinc-200">{k}</span> from "{String(diff.from)}" to "{String(diff.to)}"
                          </div>
                        ))}
                      </div>
                    )}
                    {payload.merged_from_version && (
                      <div className="text-[11px] text-emerald-400 font-medium">
                        ✓ Auto-merged with changes from version {payload.merged_from_version}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-2">Assign Work Item</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Select Active Member</label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200"
                >
                  <option value="">-- Choose member --</option>
                  {teamMembers?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Expertise in banking integrations"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedAssignee || actionLoading}
                  onClick={() => {
                    setShowAssignModal(false);
                    handleAction(() =>
                      api.assignWorkItem(item.id, selectedAssignee, item.version, assignReason)
                    );
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  Confirm Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-2">Reject Work Item Approval</h3>
            <p className="text-xs text-zinc-400 mb-3">
              A specific reason is strictly required so the assignee knows what needs fixing.
            </p>
            <div className="space-y-3">
              <textarea
                rows={3}
                required
                placeholder="Specify what needs correction..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200"
              />
              <div className="flex justify-end space-x-2">
                <button onClick={() => setShowRejectModal(false)} className="px-3 py-1.5 text-xs text-zinc-400">
                  Cancel
                </button>
                <button
                  disabled={!rejectReason.trim() || actionLoading}
                  onClick={() => {
                    setShowRejectModal(false);
                    handleAction(() =>
                      api.transitionWorkItem(item.id, 'reject', item.version, rejectReason)
                    );
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-2">Approve and Resolve Item</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Approval sign-off note (optional)"
                value={approveReason}
                onChange={(e) => setApproveReason(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200"
              />
              <div className="flex justify-end space-x-2">
                <button onClick={() => setShowApproveModal(false)} className="px-3 py-1.5 text-xs text-zinc-400">
                  Cancel
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => {
                    setShowApproveModal(false);
                    handleAction(() =>
                      api.transitionWorkItem(item.id, 'approve', item.version, approveReason)
                    );
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                >
                  Approve & Resolve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
