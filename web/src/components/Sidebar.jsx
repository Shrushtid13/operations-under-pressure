// web/src/components/Sidebar.jsx
import React from 'react';
import {
  Building2,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MessagesSquare,
  PhoneCall,
  Plus,
  Shield,
  UserCheck,
  Users
} from 'lucide-react';

export function Sidebar({
  user,
  currentHash,
  onNavigate,
  unreadCount = 0,
  onLogout,
  isMobileOpen,
  onCloseMobile
}) {
  const teams = user?.teams || [];
  const currentWorkspaceName = user?.workspaces?.[0]?.name || teams[0]?.workspace_name || 'Newtonite Engineering';
  const primaryRole = user?.is_org_admin ? 'Org admin' : (teams[0]?.role ? teams[0].role.charAt(0).toUpperCase() + teams[0].role.slice(1) : 'Member');
  const userInitials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const navItems = [
    { id: 'overview', hash: '#/overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'my-work', hash: '#/my-work', label: 'My work', icon: UserCheck },
    { id: 'all-work', hash: '#/all-work', label: 'All work', icon: ListOrdered },
    { id: 'on-call', hash: '#/on-call', label: "Who's on call", icon: PhoneCall },
    { id: 'chat', hash: '#/chat', label: 'Team chat', icon: MessagesSquare },
    { id: 'team', hash: '#/team', label: 'Team members', icon: Users },
    { id: 'inbox', hash: '#/inbox', label: 'Inbox', icon: Inbox, badge: unreadCount > 0 ? unreadCount : null }
  ];

  const content = (
    <div className="flex flex-col justify-between h-full bg-[#0f1f2e] text-slate-300 w-[260px] select-none">
      {/* Top Header & Brand */}
      <div>
        <div className="p-5 border-b border-slate-800/90 space-y-4">
          {/* Workspace Title: Big, Bold, Natural */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#2f5bea] text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              {currentWorkspaceName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight truncate" title={currentWorkspaceName}>
                {currentWorkspaceName}
              </h1>
              <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                <span>{primaryRole}</span>
                <span>·</span>
                <span>{teams.length} {teams.length === 1 ? 'team' : 'teams'}</span>
              </p>
            </div>
          </div>

          {/* Workspace Action Button: Styled like the New Work Item button (bold, natural, cobalt) */}
          <button
            onClick={() => {
              onNavigate('#/onboarding');
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full py-2.5 px-4 bg-[#2f5bea] hover:bg-[#264ecc] text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer active:scale-[0.98]"
            title="Create new workspace or switch"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>New workspace</span>
          </button>
        </div>

        {/* Navigation list */}
        <nav className="p-4 space-y-1.5 mt-2 text-[15.5px]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentHash.startsWith(item.hash) || (item.id === 'all-work' && currentHash.startsWith('#/work/'));
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.hash);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition cursor-pointer text-left ${
                  isActive
                    ? 'bg-[#1e2e3d] text-white shadow-xs font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#162635]'
                }`}
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <Icon className="w-5 h-5 shrink-0 text-slate-400" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="ml-2 px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-600 text-white tabular-nums shadow-xs">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Card */}
      <div className="p-5 border-t border-slate-800/80 bg-[#0d1b28]">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              onNavigate('#/account');
              if (onCloseMobile) onCloseMobile();
            }}
            className="flex items-center space-x-3.5 min-w-0 text-left hover:opacity-90 transition cursor-pointer"
            title="Account settings"
          >
            <div className="w-10 h-10 rounded-full bg-[#8c6d3f] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {userInitials}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white text-[15px] truncate leading-tight">
                {user?.name || 'User'}
              </div>
              <div className="text-xs text-slate-400 truncate leading-tight mt-1">
                {primaryRole}
              </div>
            </div>
          </button>

          <button
            onClick={onLogout}
            title="Sign out"
            className="p-2.5 text-slate-400 hover:text-rose-400 transition cursor-pointer rounded-xl hover:bg-slate-800"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-[240px] h-screen sticky top-0 shrink-0 z-20">
        {content}
      </aside>

      {/* Mobile Drawer (Collapse under 768px) */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative z-10">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
