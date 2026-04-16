import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import ApplicationTable from './components/ApplicationTable';
import ApplicationModal from './components/ApplicationModal';
import Analytics from './components/Analytics';
import { BarChart2, Briefcase, Plus } from 'lucide-react';

export default function App() {
  const [tab, setTab] = useState('applications');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);

  const fetchApplications = useCallback(async () => {
    try {
      const data = await api.getApplications();
      setApplications(data);
    } catch (e) {
      console.error('Failed to fetch applications:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleOpenAdd = () => {
    setEditingApp(null);
    setModalOpen(true);
  };

  const handleEdit = (app) => {
    setEditingApp(app);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this application?')) return;
    await api.deleteApplication(id);
    setApplications((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSave = async (formData) => {
    if (editingApp) {
      const updated = await api.updateApplication(editingApp.id, formData);
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } else {
      const created = await api.createApplication(formData);
      setApplications((prev) => [created, ...prev]);
    }
    setModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-semibold text-gray-900">Career Tracker</span>
            </div>
            <nav className="flex items-center gap-1">
              <button
                onClick={() => setTab('applications')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'applications'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Applications
              </button>
              <button
                onClick={() => setTab('analytics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'analytics'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                Analytics
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {tab === 'applications' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Applications</h2>
                <p className="text-sm text-gray-500 mt-0.5">{applications.length} total</p>
              </div>
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Application
              </button>
            </div>
            {loading ? (
              <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
            ) : (
              <ApplicationTable
                applications={applications}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </>
        )}

        {tab === 'analytics' && <Analytics applications={applications} />}
      </main>

      {modalOpen && (
        <ApplicationModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onDelete={handleDelete}
          initialData={editingApp}
        />
      )}
    </div>
  );
}
