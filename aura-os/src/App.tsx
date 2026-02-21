import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Send, Terminal, X, Check, Loader2 } from 'lucide-react';
import { Howl } from 'howler';

// Sounds
// Using simple base64 data URIs or paths. Assuming paths for now.
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
             if (last && last.role === 'assistant') {
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
    <div className="flex flex-col h-screen bg-neutral-900 text-gray-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center flex-col text-neutral-600 gap-4 opacity-50">
             <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
                <Terminal size={32} />
             </div>
             <p>Aura OS initialized. Ready for commands.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-neutral-800 text-gray-200 rounded-bl-none border border-neutral-700'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{m.content}</div>
            </div>
          </div>
        ))}

        {/* Pending Tool Card */}
        {pendingTool && (
          <div className="flex justify-start w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="max-w-md w-full bg-neutral-800 border-l-4 border-yellow-500 rounded-r-xl p-5 shadow-xl ring-1 ring-white/5">
                <div className="flex items-center gap-4 mb-4">
                   <div className="p-3 bg-yellow-500/10 rounded-full text-yellow-500 ring-1 ring-yellow-500/20">
                      <Terminal size={24} />
                   </div>
                   <div>
                      <h3 className="font-bold text-white tracking-wide">Permission Request</h3>
                      <p className="text-sm text-gray-400 mt-1">
                        Tool: <span className="font-mono text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">{pendingTool.tool}</span>
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
                      className="flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 active:scale-95 text-gray-300 px-4 py-2.5 rounded-lg transition-all font-medium text-sm"
                   >
                      <X size={18} strokeWidth={2.5} /> Deny
                   </button>
                </div>
             </div>
          </div>
        )}

        {isProcessing && !pendingTool && (!messages.length || messages[messages.length-1].role === 'user') && (
           <div className="flex justify-start">
              <div className="bg-neutral-800 px-4 py-3 rounded-2xl rounded-bl-none border border-neutral-700 flex items-center gap-2 animate-pulse">
                 <Loader2 size={16} className="animate-spin text-indigo-400" />
                 <span className="text-gray-400 text-sm">Thinking...</span>
              </div>
           </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="p-4 md:p-6 bg-neutral-900/80 backdrop-blur-xl border-t border-neutral-800 z-10">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="relative max-w-4xl mx-auto group"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message or command..."
            className="w-full bg-neutral-800/50 hover:bg-neutral-800 text-white placeholder-gray-500 rounded-xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-neutral-800 border border-neutral-700 transition-all shadow-lg"
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
           <div className="bg-neutral-900/90 backdrop-blur-2xl border border-neutral-700 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300 ring-1 ring-white/10">
              <div className="relative">
                 <div className="absolute inset-0 bg-green-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                 <div className="relative w-20 h-20 bg-gradient-to-tr from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-green-900/50">
                    <Check size={40} strokeWidth={3} />
                 </div>
              </div>
              <div className="text-center space-y-1">
                 <h2 className="text-2xl font-bold text-white tracking-tight">Executed</h2>
                 <div className="px-4 py-1.5 bg-neutral-800 rounded-full border border-neutral-700 inline-block">
                    <span className="font-mono text-sm text-gray-300 tracking-wide uppercase">{showFeedback}</span>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
