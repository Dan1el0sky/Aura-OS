import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Send, Terminal, X, Check, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { Howl } from 'howler';
import Settings from './Settings';

// Sounds
const soundSent = new Howl({ src: ['/sounds/sent.mp3'], volume: 0.5 });
const soundReceived = new Howl({ src: ['/sounds/received.mp3'], volume: 0.5 });
const soundExecute = new Howl({ src: ['/sounds/execute.mp3'], volume: 0.7 });

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface ToolCall {
  tool: string;
  params?: any;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingTool, setPendingTool] = useState<ToolCall | null>(null);
  const [showFeedback, setShowFeedback] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState('qwen2.5:0.5b');
  const [isDarkMode, setIsDarkMode] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial theme setup
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let unlistenStream: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let unlistenTool: UnlistenFn | undefined;

    const setupListeners = async () => {
      unlistenStream = await listen<string>('chat-stream', (event) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + event.payload }];
          } else {
             // First chunk of response
             soundReceived.play();
             return [...prev, { role: 'assistant', content: event.payload, isStreaming: true }];
          }
        });
      });

      unlistenTool = await listen<ToolCall>('tool-detected', (event) => {
        setPendingTool(event.payload);
      });

      unlistenDone = await listen('chat-done', () => {
        setIsProcessing(false);
        setMessages((prev) => {
             const last = prev[prev.length - 1];
             // Filter out JSON tool calls from chat display
             if (last && last.role === 'assistant') {
                 try {
                     const json = JSON.parse(last.content);
                     if (json.tool) {
                         // Remove the message entirely if it's just a tool call
                         return prev.slice(0, -1);
                     }
                 } catch (e) {
                     // Not JSON, keep it
                 }
                 return [...prev.slice(0, -1), { ...last, isStreaming: false }];
             }
             return prev;
        });
      });
    };

    setupListeners();

    return () => {
      if (unlistenStream) unlistenStream();
      if (unlistenDone) unlistenDone();
      if (unlistenTool) unlistenTool();
    };
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    if (pendingTool) {
      denyTool();
    }

    const msg = input;
    setInput('');
    setIsProcessing(true);
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    soundSent.play();

    try {
      await invoke('send_message', { message: msg });
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e}` }]);
    }
  };

  const executeTool = async () => {
    if (!pendingTool) return;
    try {
      await invoke('execute_tool', { toolName: pendingTool.tool, params: pendingTool.params });
      soundExecute.play();
      setShowFeedback(pendingTool.tool);
      setPendingTool(null);
      setTimeout(() => setShowFeedback(null), 3000);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Tool execution failed: ${e}` }]);
      setPendingTool(null);
    }
  };

  const denyTool = () => {
    setPendingTool(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: "(Action cancelled by user)" }]);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingTool, isProcessing]);

  return (
    <div className={`flex flex-col h-screen font-sans selection:bg-indigo-500/30 overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-neutral-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>

      {/* Settings Modal */}
      {showSettings && (
        <Settings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          currentModel={currentModel}
          onModelChange={setCurrentModel}
          isDarkMode={isDarkMode}
          onThemeToggle={() => setIsDarkMode(!isDarkMode)}
        />
      )}

      {/* Header / Settings Button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setShowSettings(true)}
          className={`p-2 rounded-full transition-all shadow-md ${isDarkMode ? 'bg-neutral-800 text-gray-400 hover:text-white hover:bg-neutral-700' : 'bg-white text-gray-600 hover:text-indigo-600 hover:bg-gray-100 border border-gray-200'}`}
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center flex-col gap-4 opacity-50">
             <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-neutral-800 text-neutral-600' : 'bg-white text-gray-400 shadow-md'}`}>
                <Terminal size={32} />
             </div>
             <p className={isDarkMode ? 'text-neutral-500' : 'text-gray-400'}>Aura OS initialized. Ready for commands.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-none'
                : isDarkMode
                  ? 'bg-neutral-800 text-gray-200 rounded-bl-none border border-neutral-700'
                  : 'bg-white text-gray-800 rounded-bl-none border border-gray-200 shadow-sm'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{m.content}</div>
            </div>
          </div>
        ))}

        {/* Pending Tool Card */}
        {pendingTool && (
          <div className="flex justify-start w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className={`max-w-md w-full border-l-4 border-yellow-500 rounded-r-xl p-5 shadow-xl ring-1 ${isDarkMode ? 'bg-neutral-800 ring-white/5' : 'bg-white ring-black/5 shadow-yellow-500/10'}`}>
                <div className="flex items-center gap-4 mb-4">
                   <div className="p-3 bg-yellow-500/10 rounded-full text-yellow-500 ring-1 ring-yellow-500/20">
                      <Terminal size={24} />
                   </div>
                   <div>
                      <h3 className={`font-bold tracking-wide ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Permission Request</h3>
                      <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Tool: <span className="font-mono text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">{pendingTool.tool}</span>
                      </p>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <button
                      onClick={executeTool}
                      className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-sm shadow-lg shadow-indigo-900/20"
                   >
                      <Check size={18} strokeWidth={2.5} /> Confirm
                   </button>
                   <button
                      onClick={denyTool}
                      className={`flex items-center justify-center gap-2 active:scale-95 px-4 py-2.5 rounded-lg transition-all font-medium text-sm ${isDarkMode ? 'bg-neutral-700 hover:bg-neutral-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                   >
                      <X size={18} strokeWidth={2.5} /> Deny
                   </button>
                </div>
             </div>
          </div>
        )}

        {isProcessing && !pendingTool && (!messages.length || messages[messages.length-1].role === 'user') && (
           <div className="flex justify-start">
              <div className={`px-4 py-3 rounded-2xl rounded-bl-none border flex items-center gap-2 animate-pulse ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                 <Loader2 size={16} className="animate-spin text-indigo-500" />
                 <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Thinking...</span>
              </div>
           </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className={`p-4 md:p-6 backdrop-blur-xl border-t z-10 ${isDarkMode ? 'bg-neutral-900/80 border-neutral-800' : 'bg-white/80 border-gray-200'}`}>
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="relative max-w-4xl mx-auto group"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message or command..."
            className={`w-full rounded-xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 border transition-all shadow-lg ${isDarkMode ? 'bg-neutral-800/50 hover:bg-neutral-800 text-white placeholder-gray-500 focus:bg-neutral-800 border-neutral-700' : 'bg-white hover:bg-gray-50 text-gray-900 placeholder-gray-400 focus:bg-white border-gray-200'}`}
            disabled={isProcessing}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-90 shadow-md shadow-indigo-900/30"
          >
            {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>

      {/* Cool Square Feedback Overlay */}
      {showFeedback && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
           <div className={`backdrop-blur-2xl border p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300 ring-1 ${isDarkMode ? 'bg-neutral-900/90 border-neutral-700 ring-white/10' : 'bg-white/90 border-gray-200 ring-black/5 shadow-indigo-500/20'}`}>
              <div className="relative">
                 <div className="absolute inset-0 bg-green-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                 <div className="relative w-20 h-20 bg-gradient-to-tr from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-green-900/50">
                    <Check size={40} strokeWidth={3} />
                 </div>
              </div>
              <div className="text-center space-y-1">
                 <h2 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Executed</h2>
                 <div className={`px-4 py-1.5 rounded-full border inline-block ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-100 border-gray-200'}`}>
                    <span className={`font-mono text-sm tracking-wide uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{showFeedback}</span>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
