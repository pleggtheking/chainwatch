import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Overview from './pages/Overview.js';
import RepoDetail from './pages/RepoDetail.js';
import EventFeed from './pages/EventFeed.js';
import Settings from './pages/Settings.js';
import { getApiKey } from './api.js';

export default function App() {
  const [hasKey] = useState(() => !!getApiKey());

  if (!hasKey) {
    return <Settings />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-gray-900">🛡️ ChainWatch</span>
            <div className="flex gap-4">
              <NavLink to="/" end className={({ isActive }) => `text-sm ${isActive ? 'text-chainwatch-red font-semibold' : 'text-gray-600 hover:text-gray-900'}`}>
                Overview
              </NavLink>
              <NavLink to="/feed" className={({ isActive }) => `text-sm ${isActive ? 'text-chainwatch-red font-semibold' : 'text-gray-600 hover:text-gray-900'}`}>
                Live Feed
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `text-sm ${isActive ? 'text-chainwatch-red font-semibold' : 'text-gray-600 hover:text-gray-900'}`}>
                Settings
              </NavLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/repo/:id" element={<RepoDetail />} />
          <Route path="/feed" element={<EventFeed />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
