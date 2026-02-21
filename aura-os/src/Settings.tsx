import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, RefreshCw, Monitor, Moon, Sun } from 'lucide-react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onModelChange: (model: string) => void;
  isDarkMode: boolean;
  onThemeToggle: () => void;
}

export default function Settings({ isOpen, onClose, currentModel, onModelChange, isDarkMode, onThemeToggle }: SettingsProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const availableModels = await invoke<string[]>('get_ollama_models');
      setModels(availableModels);
    } catch (e) {
      console.error('Failed to fetch models:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  const handleModelSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    onModelChange(newModel);
    try {
      await invoke('set_ollama_model', { model: newModel });
    } catch (e) {
      console.error('Failed to set model:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-md rounded-2xl shadow-2xl p-6 ring-1 ring-white/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Monitor size={20} /> Settings
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between p-4 bg-neutral-800/50 rounded-xl border border-neutral-700/50">
            <div className="flex items-center gap-3">
               {isDarkMode ? <Moon size={20} className="text-indigo-400" /> : <Sun size={20} className="text-yellow-400" />}
               <span className="text-gray-200 font-medium">Dark Mode</span>
            </div>
            <button
               onClick={onThemeToggle}
               className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${isDarkMode ? 'bg-indigo-600 justify-end' : 'bg-neutral-600 justify-start'}`}
            >
               <div className="w-4 h-4 bg-white rounded-full shadow-md"></div>
            </button>
          </div>

          {/* AI Model Selection */}
          <div className="space-y-3">
             <label className="text-sm font-medium text-gray-400 ml-1">AI Model (Ollama)</label>
             <div className="flex gap-2">
                <div className="relative flex-1">
                   <select
                      value={currentModel}
                      onChange={handleModelSelect}
                      disabled={loading}
                      className="w-full appearance-none bg-neutral-800 text-white border border-neutral-700 rounded-xl px-4 py-3 pr-8 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                   >
                      <option value="" disabled>Select a model...</option>
                      {models.map((m) => (
                         <option key={m} value={m}>{m}</option>
                      ))}
                   </select>
                   <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                   </div>
                </div>
                <button
                   onClick={fetchModels}
                   disabled={loading}
                   className="p-3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-xl border border-neutral-700 transition-colors disabled:opacity-50"
                   title="Refresh Models"
                >
                   <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
             </div>
             <p className="text-xs text-gray-500 px-1">
                Selected model will be used for all future requests. Ensure Ollama is running.
             </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
           <button
              onClick={onClose}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
           >
              Done
           </button>
        </div>
      </div>
    </div>
  );
}
