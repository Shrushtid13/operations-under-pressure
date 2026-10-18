// web/src/components/OverviewSummary.jsx
import React from 'react';
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  HelpCircle,
  PlayCircle,
  UserX
} from 'lucide-react';

export function OverviewSummary({ summaryData, selectedTeamId, onFilterClick }) {
  if (!summaryData?.teams) return null;

  // Aggregate across all teams if no specific team is selected or single team
  let teamStats;
  if (selectedTeamId) {
    teamStats = summaryData.teams.find((t) => String(t.team_id) === String(selectedTeamId));
  }

  // If no specific team or aggregated view:
  const openCount = teamStats ? parseInt(teamStats.open_count, 10) : summaryData.teams.reduce((acc, t) => acc + parseInt(t.open_count || 0, 10), 0);
  const inProgressCount = teamStats ? parseInt(teamStats.in_progress_count, 10) : summaryData.teams.reduce((acc, t) => acc + parseInt(t.in_progress_count || 0, 10), 0);
  const pendingApprovalCount = teamStats ? parseInt(teamStats.pending_approval_count, 10) : summaryData.teams.reduce((acc, t) => acc + parseInt(t.pending_approval_count || 0, 10), 0);
  const unassignedCount = teamStats ? parseInt(teamStats.unassigned_count, 10) : summaryData.teams.reduce((acc, t) => acc + parseInt(t.unassigned_count || 0, 10), 0);
  const overdueCount = teamStats ? parseInt(teamStats.overdue_count, 10) : summaryData.teams.reduce((acc, t) => acc + parseInt(t.overdue_count || 0, 10), 0);
  const staleCount = teamStats ? parseInt(teamStats.stale_count, 10) : summaryData.teams.reduce((acc, t) => acc + parseInt(t.stale_count || 0, 10), 0);

  const cards = [
    {
      title: 'Open / Claimable',
      count: openCount,
      icon: PlayCircle,
      color: 'text-sky-400 bg-sky-950/40 border-sky-800/40 hover:border-sky-700',
      filter: { status: 'open' }
    },
    {
      title: 'In Progress',
      count: inProgressCount,
      icon: Clock,
      color: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/40 hover:border-indigo-700',
      filter: { status: 'in_progress' }
    },
    {
      title: 'Pending Approval',
      count: pendingApprovalCount,
      icon: FileCheck2,
      color: 'text-purple-400 bg-purple-950/40 border-purple-800/40 hover:border-purple-700',
      filter: { status: 'pending_approval' }
    },
    {
      title: 'Unassigned',
      count: unassignedCount,
      icon: UserX,
      color: 'text-amber-400 bg-amber-950/40 border-amber-800/40 hover:border-amber-700',
      filter: { assignee: 'none' }
    },
    {
      title: 'Overdue Items',
      count: overdueCount,
      icon: AlertTriangle,
      color: 'text-rose-400 bg-rose-950/40 border-rose-800/40 hover:border-rose-700',
      filter: { overdue: 'true' }
    },
    {
      title: 'Stale (> 3 days)',
      count: staleCount,
      icon: HelpCircle,
      color: 'text-zinc-400 bg-zinc-900 border-zinc-800 hover:border-zinc-700',
      filter: { needs_attention: 'true' }
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <button
            key={i}
            onClick={() => onFilterClick(c.filter)}
            className={`flex flex-col justify-between p-3.5 rounded-lg border text-left transition shadow-sm ${c.color}`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{c.title}</span>
              <Icon className="w-4 h-4 opacity-75" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-zinc-100">{c.count}</div>
          </button>
        );
      })}
    </div>
  );
}
