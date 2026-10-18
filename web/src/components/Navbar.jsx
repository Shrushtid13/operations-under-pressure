// web/src/components/Navbar.jsx
import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Radio,
  Shield,
  Users,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { api } from '../api.js';

export function Navbar({
  user,
  teams,
  selectedTeamId,
  onSelectTeam,
  onLogout,
  unreadCount,
  onOpenNotifications,
  onOpenMembersModal,
  isWsConnected
}) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedTeam = teams?.find((t) => String(t.id) === String(selectedTeamId)) || teams?.[0];
  const userRole = selectedTeam?.role || (user?.is_org_admin ? 'org_admin' : 'viewer');

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);
    setLoading(true);

    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-40 px-6 py-3 flex items-center justify-between">
      {/* Left: Branding & Team Switcher */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
            Ω
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-1.5">
              Newtonite <span className="text-zinc-400 font-normal">| Operations Under Pressure</span>
            </h1>
          </div>
        </div>

        {/* Team Selector */}
        {teams && teams.length > 0 && (
          <div className="relative">
            <select
              value={selectedTeamId || ''}
              onChange={(e) => onSelectTeam(e.target.value)}
              className="bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 text-xs font-medium rounded-md px-3 py-1.5 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none pr-8 transition"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.key})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        )}

        {/* WebSocket Real-time Status */}
        <div className="flex items-center space-x-1.5 text-xs">
          <Radio className={`w-3.5 h-3.5 ${isWsConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
          <span className="text-zinc-400 text-[11px]">
            {isWsConnected ? 'Live hints' : 'Polling mode'}
          </span>
        </div>
      </div>

      {/* Right: Actions & User Menu */}
      <div className="flex items-center space-x-4">
        {/* Team Members Button (for leads or org admin) */}
        {['lead', 'org_admin'].includes(userRole) && (
          <button
            onClick={onOpenMembersModal}
            className="flex items-center space-x-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 px-3 py-1.5 rounded-md border border-zinc-700 transition"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Members</span>
          </button>
        )}

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User Pill & Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2.5 bg-zinc-800 hover:bg-zinc-750 px-3 py-1.5 rounded-md border border-zinc-700 transition text-left"
          >
            <div className="w-6 h-6 rounded-full bg-indigo-900/80 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-xs font-medium">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-200 leading-none">{user?.name}</div>
              <div className="text-[10px] text-zinc-400 leading-none mt-1 capitalize flex items-center gap-1">
                {user?.is_org_admin && <Shield className="w-2.5 h-2.5 text-amber-400" />}
                {user?.is_org_admin ? 'Org Admin' : userRole}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-zinc-400 ml-1" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-zinc-800 text-zinc-400">
                <div className="font-medium text-zinc-200">{user?.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{user?.email}</div>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  setShowPasswordModal(true);
                }}
                className="w-full text-left px-3 py-2 hover:bg-zinc-800 text-zinc-300 flex items-center space-x-2"
              >
                <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                <span>Change Password</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 hover:bg-red-950/40 text-red-400 hover:text-red-300 flex items-center space-x-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">Change Account Password</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Requires min 12 characters. Other sessions will be automatically revoked.
            </p>

            {passwordError && (
              <div className="p-3 mb-3 bg-red-950/50 border border-red-800/60 rounded-md text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 mb-3 bg-emerald-950/50 border border-emerald-800/60 rounded-md text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Password changed successfully!</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">New Password (min 12 chars)</label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
