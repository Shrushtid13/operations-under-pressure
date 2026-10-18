// web/src/components/Sidebar.jsx
import React from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  Layers,
  LayoutDashboard,
  LogOut,
  Radio,
  Settings,
  Shield,
  ShieldAlert,
  Users
} from 'lucide-react';

export function Sidebar({
  user,
  teams,
  selectedTeamId,
  onSelectTeam,
  activeNav,
  onSelectNav,
  onOpenMembersModal,
  onLogout,
  isWsConnected
}) {
  const currentTeam = teams?.find((t) => String(t.id) === String(selectedTeamId)) || teams?.[0];
  const userRole = currentTeam?.role || (user?.is_org_admin ? 'org_admin' : 'viewer');
  const isLeadOrAdmin = userRole === 'lead' || user?.is_org_admin;

  return (
    <aside className="w-60 bg-[#0d111c] border-r border-[#1a2234] flex flex-col justify-between shrink-0 select-none h-screen sticky top-0 text-slate-300">
      {/* Top Branding & Nav List */}
      <div className="flex flex-col overflow-y-auto">
        {/* Brand Header: SwarmOps with logo icon */}
        <div className="h-16 px-5 border-b border-[#1a2234] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-600/30">
              <Bot className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              SwarmOps
            </span>
          </div>

          <div
            className="flex items-center space-x-1"
            title={isWsConnected ? 'Connected to live event stream' : 'Operating in polling mode'}
          >
            <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          </div>
        </div>

        {/* Team Selector Context */}
        <div className="p-3 border-b border-[#1a2234] bg-[#090d16]/60">
          <div className="relative">
            <select
              value={selectedTeamId || ''}
              onChange={(e) => onSelectTeam(e.target.value)}
              className="w-full bg-[#131929] hover:bg-[#182136] text-slate-200 text-xs font-medium rounded-lg px-3 py-2 border border-[#222e46] focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none pr-8 transition"
            >
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} — {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="p-3 space-y-5 text-xs">
          {/* SECTION 1: OVERVIEW */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              OVERVIEW
            </div>

            <button
              onClick={() => onSelectNav('all')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium transition cursor-pointer text-left ${
                activeNav === 'all'
                  ? 'bg-[#182136] text-white font-semibold'
                  : 'text-slate-400 hover:bg-[#131929] hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onSelectNav('my_work')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium transition cursor-pointer text-left ${
                activeNav === 'my_work'
                  ? 'bg-[#182136] text-white font-semibold'
                  : 'text-slate-400 hover:bg-[#131929] hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4 text-slate-400" />
              <span>Activity</span>
            </button>
          </div>

          {/* SECTION 2: OPERATIONS */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              OPERATIONS
            </div>

            <button
              onClick={() => onSelectNav('needs_attention')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition cursor-pointer text-left ${
                activeNav === 'needs_attention'
                  ? 'bg-[#182136] text-white font-semibold'
                  : 'text-slate-400 hover:bg-[#131929] hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-slate-400" />
                <span>Incidents</span>
              </div>
            </button>

            <button
              onClick={() => onSelectNav('all')}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium text-slate-400 hover:bg-[#131929] hover:text-slate-200 transition cursor-pointer text-left"
            >
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Services</span>
            </button>

            <button
              onClick={() => onSelectNav('pending_approval')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium transition cursor-pointer text-left ${
                activeNav === 'pending_approval'
                  ? 'bg-[#182136] text-white font-semibold'
                  : 'text-slate-400 hover:bg-[#131929] hover:text-slate-200'
              }`}
            >
              <Bot className="w-4 h-4 text-slate-400" />
              <span>Agents & Sign-Offs</span>
            </button>
          </div>

          {/* SECTION 3: ORGANIZATION */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              ORGANIZATION
            </div>

            <button
              onClick={onOpenMembersModal}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium text-slate-400 hover:bg-[#131929] hover:text-slate-200 transition cursor-pointer text-left"
            >
              <Users className="w-4 h-4 text-slate-400" />
              <span>Team</span>
            </button>

            <button
              onClick={onOpenMembersModal}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium text-slate-400 hover:bg-[#131929] hover:text-slate-200 transition cursor-pointer text-left"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom User Pill & Sign Out */}
      <div className="p-3 border-t border-[#1a2234] bg-[#090d16]/80 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-200 truncate">{user?.name}</div>
            <div className="text-[10px] text-slate-400 truncate capitalize">{userRole}</div>
          </div>
        </div>

        <button
          onClick={onLogout}
          title="Sign out of operations console"
          className="p-1.5 text-slate-400 hover:text-rose-400 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
