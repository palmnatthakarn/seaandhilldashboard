'use client';

import { MessageCircle, X, Send, Loader2, Database } from 'lucide-react';
import { useCallback, useState, useEffect, useRef } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
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

    try {
      const response = await fetch('/api/chat-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
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
      console.error('[ChatWidget] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  useEffect(() => {
    const handleAskAi = (event: Event) => {
      const customEvent = event as CustomEvent<{ prompt?: string }>;
      const prompt = customEvent.detail?.prompt?.trim();
      if (!prompt) return;

      setIsOpen(true);
      void sendMessage(prompt);
    };

    window.addEventListener('seaandhill:ask-ai', handleAskAi);
    return () => window.removeEventListener('seaandhill:ask-ai', handleAskAi);
  }, [sendMessage]);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-50 md:bottom-5 md:right-5 xl:bottom-6 xl:right-6">
          <button
            onClick={() => setIsOpen(true)}
            className="relative rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 xl:p-4"
            aria-label="Open AI Assistant"
          >
            <MessageCircle className="h-5 w-5 xl:h-6 xl:w-6" />

            {/* Message count badge */}
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white">
                {messages.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[min(600px,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 md:bottom-5 md:right-5 xl:bottom-6 xl:right-6">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-600 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              <h3 className="font-semibold">AI Data Assistant</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-blue-700 rounded-full p-1 transition-colors"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Ask me anything about your data!</p>
                <p className="text-xs mt-2">
                  Try: &quot;Show me sales from last month&quot;
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                >
                  {message.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="text-sm">
                      <MarkdownRenderer content={message.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Error Message */}
            {error && (
              <div className="flex justify-start">
                <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg px-4 py-2 max-w-[80%]">
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">⚠️ เกิดข้อผิดพลาด</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    Querying database...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                sendMessage(input);
              }
            }}
            className="border-t border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your data..."
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
