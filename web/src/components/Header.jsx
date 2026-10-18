// web/src/components/Header.jsx
import React from 'react';
import {
  Bell,
  Moon,
  Plus,
  Search,
  Sun,
  X
} from 'lucide-react';

export function Header({
  viewTitle,
  breadcrumbs = [],
  searchValue,
  onSearchChange,
  unreadCount,
  onOpenNotifications,
  onOpenCreateModal,
  canCreate,
  user,
  selectedTeam,
  theme = 'light',
  onToggleTheme
}) {
  const isLight = theme === 'light';

  return (
    <header className={`h-16 px-6 flex items-center justify-between sticky top-0 z-30 transition-colors ${
      isLight
        ? 'bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800'
        : 'bg-[#0a0e17]/95 backdrop-blur-md border-b border-[#1e293b] text-slate-100'
    }`}>
      {/* Left: View Breadcrumbs / Title or Search Bar */}
      <div className="flex items-center space-x-6 flex-1 max-w-2xl">
        {/* Search Input directly in header as in reference screenshot */}
        <div className="relative w-72 sm:w-96">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search incidents, services, or agents..."
            value={searchValue || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full text-xs pl-8 pr-7 py-2 rounded-lg focus:outline-none transition ${
              isLight
                ? 'bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:border-indigo-500 placeholder-slate-400'
                : 'bg-[#111726] border border-[#222f46] text-slate-200 focus:border-sky-500 placeholder-slate-500'
            }`}
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Breadcrumb / Title */}
        <div className="hidden lg:flex items-center space-x-2 text-xs">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition font-medium cursor-pointer"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-slate-400 font-medium">{crumb.label}</span>
              )}
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </React.Fragment>
          ))}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{viewTitle}</span>
        </div>
      </div>

      {/* Right: Theme Toggle + Notifications Bell + Create Button + User Profile */}
      <div className="flex items-center space-x-4">
        {/* Theme Toggle (Light / Dark) */}
        <button
          onClick={onToggleTheme}
          title={isLight ? 'Switch to Dark Ops Mode' : 'Switch to Light Studio Mode'}
          className={`p-2 rounded-lg transition cursor-pointer ${
            isLight
              ? 'hover:bg-slate-100 text-slate-500'
              : 'hover:bg-[#151d2e] text-slate-400'
          }`}
        >
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotifications}
          className={`relative p-2 rounded-lg transition cursor-pointer ${
            isLight
              ? 'hover:bg-slate-100 text-slate-500'
              : 'hover:bg-[#151d2e] text-slate-400'
          }`}
          title="Notifications & Activity"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute 1.5 top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-[#0a0e17]"></span>
          )}
        </button>

        {/* Primary Action Button */}
        {canCreate && (
          <button
            onClick={onOpenCreateModal}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Incident</span>
          </button>
        )}

        {/* User Profile (matches reference screenshot: Avatar + Name + Role) */}
        {user && (
          <div className="flex items-center space-x-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-slate-100 dark:ring-slate-700">
              {user.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-left text-xs leading-tight">
              <div className="font-semibold text-slate-800 dark:text-slate-100">{user.name}</div>
              <div className="text-[11px] text-slate-400 capitalize">
                {user.is_org_admin ? 'Admin' : selectedTeam?.role || 'Engineer'}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
