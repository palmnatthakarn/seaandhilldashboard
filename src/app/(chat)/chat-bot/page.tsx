'use client';

import { Send, Loader2, Database, RotateCcw, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { useBranchStore } from '@/store/useBranchStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatBotPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingSchema, setIsRefreshingSchema] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<{ tableCount: number; lastUpdated: string | null } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const availableBranches = useBranchStore((s) => s.availableBranches);

  // Fetch schema status on mount
  useEffect(() => {
    fetchSchemaStatus();
  }, []);

  const fetchSchemaStatus = async () => {
    try {
      const res = await fetch('/api/refresh-schema');
      const data = await res.json();
      setSchemaStatus({ tableCount: data.tableCount, lastUpdated: data.lastUpdated });
    } catch (err) {
      console.error('Failed to fetch schema status:', err);
    }
  };

  const refreshSchema = async () => {
    setIsRefreshingSchema(true);
    try {
      const res = await fetch('/api/refresh-schema', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSchemaStatus({ tableCount: data.tableCount, lastUpdated: data.lastUpdated });
      } else {
        setError(`Failed to refresh schema: ${data.error}`);
      }
    } catch (err) {
      setError('Failed to refresh schema');
    } finally {
      setIsRefreshingSchema(false);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('/api/chat-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          branchContext: {
            selectedBranches,
            availableBranches,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;

          // Update assistant message in real-time
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: assistantContent },
              ];
            } else {
              return [
                ...prev,
                {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: assistantContent,
                },
              ];
            }
          });
        }
      }
    } catch (err) {
      console.error('[ChatBot] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        sendMessage(input);
      }
    }
  };

  return (
    <div className="h-screen bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header - Minimal like ChatGPT */}
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">AI Data Assistant</h1>
            {schemaStatus && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                ({schemaStatus.tableCount} tables)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshSchema}
              disabled={isRefreshingSchema}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm disabled:opacity-50"
              title="Refresh database schema"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingSchema ? 'animate-spin' : ''}`} />
              Schema
            </button>
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="flex items-center gap-2 px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                New Chat
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Messages Area - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Welcome Screen */}
          {messages.length === 0 && (
            <div className="text-center py-20">
              <Database className="w-16 h-16 mx-auto mb-6 text-blue-600 opacity-80" />
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                How can I help you today?
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Ask me anything about your data
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                <button
                  onClick={() => sendMessage('แสดงยอดขายเดือนที่แล้ว')}
                  className="p-4 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <p className="font-medium text-gray-800 dark:text-gray-200">ยอดขายเดือนที่แล้ว</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ดูสรุปยอดขายรายเดือน</p>
                </button>
                <button
                  onClick={() => sendMessage('สินค้าขายดี 10 อันดับแรก')}
                  className="p-4 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <p className="font-medium text-gray-800 dark:text-gray-200">สินค้าขายดี</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Top 10 สินค้าขายดี</p>
                </button>
                <button
                  onClick={() => sendMessage('เปรียบเทียบยอดขายรายภูมิภาค')}
                  className="p-4 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <p className="font-medium text-gray-800 dark:text-gray-200">ยอดขายรายภูมิภาค</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">เปรียบเทียบแต่ละพื้นที่</p>
                </button>
                <button
                  onClick={() => sendMessage('ลูกค้าที่มียอดซื้อสูงสุด')}
                  className="p-4 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <p className="font-medium text-gray-800 dark:text-gray-200">ลูกค้า Top</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ลูกค้ายอดซื้อสูงสุด</p>
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`py-6 ${message.role === 'assistant' ? 'bg-gray-50 dark:bg-gray-800/50 -mx-4 px-4 rounded-xl' : ''}`}
            >
              <div className="flex gap-4">
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-green-600 text-white'
                }`}>
                  {message.role === 'user' ? (
                    <span className="text-sm font-medium">U</span>
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                    {message.role === 'user' ? 'You' : 'AI Assistant'}
                  </p>
                  {message.role === 'user' ? (
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="text-gray-700 dark:text-gray-300">
                      <MarkdownRenderer content={message.content} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Error Message */}
          {error && (
            <div className="py-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center">
                  <span className="text-sm">!</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Error</p>
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="py-6 bg-gray-50 dark:bg-gray-800/50 -mx-4 px-4 rounded-xl">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">AI Assistant</p>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - Fixed at bottom, full width */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message AI Assistant..."
              disabled={isLoading}
              rows={1}
              className="flex-1 px-4 py-3 bg-transparent border-none outline-none resize-none text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 disabled:opacity-50 max-h-[200px]"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="flex-shrink-0 m-1.5 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
