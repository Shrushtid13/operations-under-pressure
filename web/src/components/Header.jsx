// web/src/components/Header.jsx
import React, { useEffect, useRef } from 'react';
import {
  Bell,
  Menu,
  Plus,
  Search,
  X
} from 'lucide-react';

export function Header({
  workspaceName,
  onOpenWorkspace,
  searchValue,
  onSearchChange,
  isLive,
  unreadCount = 0,
  onOpenInbox,
  onOpenNewItem,
  canCreate,
  onOpenMobileMenu
}) {
  const searchInputRef = useRef(null);

  // Global hotkey: press '/' to focus search input
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-18 px-6 sm:px-8 bg-[#f4f6f8] border-b border-[#e2e8f0] flex items-center justify-between sticky top-0 z-10 select-none">
      {/* Left: Mobile hamburger + Workspace Pill + Search Input */}
      <div className="flex items-center space-x-3 flex-1 max-w-xl">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2.5 rounded-xl text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {workspaceName && (
          <button
            onClick={onOpenWorkspace}
            className="hidden lg:flex items-center space-x-2 px-3 py-2 rounded-xl bg-white border border-[#e2e8f0] hover:border-slate-300 transition text-slate-800 text-xs font-semibold cursor-pointer shadow-xs shrink-0"
            title="Current workspace · Click to switch or create"
          >
            <span className="w-2 h-2 rounded-full bg-[#2f5bea]"></span>
            <span className="truncate max-w-[140px]">{workspaceName}</span>
          </button>
        )}

        <div className="relative w-full max-w-md">
          <Search className="w-4.5 h-4.5 text-slate-400 absolute left-4 top-3.5" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search work (press /)"
            value={searchValue || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white border border-[#e2e8f0] rounded-2xl pl-11 pr-10 py-3 text-[15px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f5bea] shadow-xs transition"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Live indicator + Bell unread count + New work item button */}
      <div className="flex items-center space-x-5 pl-4">
        {/* Live status indicator */}
        <div className="flex items-center space-x-2 text-[14.5px] text-slate-600 font-medium">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isLive ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}
          />
          <span className="hidden sm:inline">
            {isLive ? 'Live' : 'Polling'}
          </span>
        </div>

        {/* Notification Bell */}
        <button
          onClick={onOpenInbox}
          className="relative p-2.5 rounded-xl text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent hover:border-[#e2e8f0] transition cursor-pointer"
          title="Inbox"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center tabular-nums shadow-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Primary Action Button: Cobalt */}
        {canCreate && (
          <button
            onClick={onOpenNewItem}
            className="px-5 py-3 bg-[#2f5bea] hover:bg-[#264ecc] text-white text-[15px] font-semibold rounded-2xl flex items-center space-x-2.5 transition shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>New work item</span>
          </button>
        )}
      </div>
    </header>
  );
}
