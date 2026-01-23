import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Download, Bot, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ChatMessage from "./chatmessage";

import {
  createThread,
  postMessage,
  getThread,
  getThreadMessages,
  startStreamWithCheckpoint,
  getCheckpoint,
  getCurrentUser
} from "@/lib/api";

export interface ThinkingStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed';
  timestamp: Date;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  type: 'news' | 'filing' | 'analysis' | 'data';
  relevance: number;
  date: Date;
  messageId?: string; // <--- ADDED: To link source to a specific message
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  skipAnimation?: boolean;
}

interface ChatMainProps {
  currentThread: string | null;
  messages: Message[];
  onThreadUpdate: (threadId: string, updates: {
    messages?: Message[];
    sources?: Source[];
    thinkingSteps?: ThinkingStep[];
    title?: string;
    preview?: string;
    timestamp?: Date;
  }) => void;
  onActiveMessageChange?: (messageId: string | null) => void;
}

function generateThinkingSteps(query: string): ThinkingStep[] {
  return [
    { id: "1", action: "Query Processing", description: `Analyzing your request about "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"`, status: 'completed' as const, timestamp: new Date() },
    { id: "2", action: "Financial Data Search", description: "Searching SEC filings, earnings reports, and market data", status: 'running' as const, timestamp: new Date(Date.now() + 1000) },
    { id: "3", action: "News & Analysis", description: "Scanning recent financial news and analyst reports", status: 'pending' as const, timestamp: new Date(Date.now() + 2000) },
    { id: "4", action: "Data Synthesis", description: "Combining insights from multiple sources", status: 'pending' as const, timestamp: new Date(Date.now() + 3000) }
  ];
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
    const map = new Map<string, Message>();
    incoming.forEach(m => {
        map.set(m.id, { ...m, skipAnimation: true }); 
    });
    current.forEach(m => {
        if (map.has(m.id)) {
            if (m.isStreaming) {
                map.set(m.id, m);
            }
        } else {
            map.set(m.id, m);
        }
    });
    return Array.from(map.values()).sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return tA - tB;
    });
}

export default function ChatMain({ currentThread, messages, onThreadUpdate, onActiveMessageChange }: ChatMainProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const lastHydratedRef = useRef<{ thread?: string; ts?: number }>({});
  const HYDRATE_COOLDOWN_MS = 2000;

  const sseControllerRef = useRef<{ es?: EventSource; close?: () => void; checkpoint?: any } | null>(null);

  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const messageElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());


  const handleAnimationComplete = useCallback((messageId: string) => {
    if (!currentThread) return;
    
    // We update the local ref and notify the parent to save state
    const current = messagesRef.current || [];
    const idx = current.findIndex(m => m.id === messageId);
    
    if (idx !== -1 && !current[idx].skipAnimation) {
       const copy = [...current];
       // This is the key: set skipAnimation to true so it renders statically next time
       copy[idx] = { ...copy[idx], skipAnimation: true }; 
       onThreadUpdate(currentThread, { messages: copy });
    }
  }, [currentThread, onThreadUpdate]);



  // INTERSECTION OBSERVER
  useEffect(() => {
    if (!messages.length || !onActiveMessageChange) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute('data-message-id');
            if (messageId) {
              onActiveMessageChange(messageId);
            }
          }
        });
      },
      {
        root: null, 
        rootMargin: '-40% 0px -40% 0px', 
        threshold: 0.05 // Lower threshold to catch long messages easier
      }
    );

    messageElementRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [messages, onActiveMessageChange]);

  const [userId, setUserId] = useState<string>('anonymous');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    (async () => {
      try {
        const me = await getCurrentUser();
        if (!me) {
          toast({ title: 'Please sign in', description: 'You must be signed in to continue.', variant: 'destructive' });
          return;
        }
        const key = 'df_research_user_id';
        let id = me.id;
        if (id) {
          localStorage.setItem(key, id);
          if (mounted) setUserId(id);
        } else {
          id = uuid();
          localStorage.setItem(key, id);
          if (mounted) setUserId(id);
        }
      } catch (err) {
        console.warn('getCurrentUser failed', err);
      }
    })();
    return () => { mounted = false; };
  }, [toast]);

  const welcomeMessage: Message = {
    id: "welcome",
    type: "assistant",
    content: "Welcome to Deep Finance Research! I'm your AI financial analyst powered by Google's Gemini AI. I can help you analyze stocks, examine earnings reports, compare companies, and conduct comprehensive market research. What would you like to research today?",
    timestamp: new Date(),
    skipAnimation: true 
  };

  const displayMessages = messages.length === 0 ? [welcomeMessage] : messages;

  function normalizeSources(rawSources: any[] = []): Source[] {
    const seen = new Set<string>();
    const out: Source[] = [];

    (rawSources || []).forEach((s: any, i: number) => {
      const url = (s.url || s.link || s.uri || '').trim();
      const key = url || (s.title ? s.title.trim().slice(0, 200) : `src-${i}`);

      if (url && seen.has(url)) return;
      if (!url && seen.has(key)) return;

      seen.add(url || key);

      const titleCandidate = s.title || (s.url ? new URL(s.url).hostname : undefined) || `Source ${i + 1}`;
      const snippetCandidate = s.snippet ?? s.description ?? s.summary ?? '';
      const typeCandidate = (s.type && ['news', 'filing', 'analysis', 'data'].includes(s.type)) ? s.type : 'data';
      const relevance = typeof s.relevance === 'number' ? s.relevance : 0.7;
      const date = s.date ? new Date(s.date) : new Date();

      out.push({
        id: s.id ?? `src-${i}-${Date.now()}`,
        title: titleCandidate,
        url: url,
        snippet: snippetCandidate,
        type: typeCandidate,
        relevance,
        date,
      });
    });

    return out;
  }

  function extractUrlsFromText(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /https?:\/\/[^\s"'<>)+\]\}]+/g;
    const matches = text.match(urlRegex) || [];
    return Array.from(new Set(matches));
  }

  function buildSourcesFromUrls(urls: string[], date?: Date): Source[] {
    return urls.map((u, i) => {
      let title = u;
      try {
        const parsed = new URL(u);
        title = parsed.hostname + (parsed.pathname === '/' ? '' : parsed.pathname);
      } catch (e) { /* keep raw */ }
      return {
        id: `derived-${Date.now()}-${i}`,
        title,
        url: u,
        snippet: '',
        type: 'data',
        relevance: 0.7,
        date: date ?? new Date(),
      } as Source;
    });
  }

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        setTimeout(() => { (scrollElement as any).scrollTop = (scrollElement as any).scrollHeight; }, 30);
      }
    }
  }, [displayMessages]);

  useEffect(() => {
    let cancelled = false;
    if (!currentThread) return;

    const last = lastHydratedRef.current;
    const now = Date.now();
    if (last.thread === currentThread && last.ts && now - last.ts < HYDRATE_COOLDOWN_MS) {
      return;
    }

    lastHydratedRef.current = { thread: currentThread, ts: now };

    (async () => {
      try {
        if (isLoading) return;

        const ck = await getCheckpoint(userId, currentThread).catch(() => ({ exists: false }));
        if (cancelled) return;

        try {
          if (ck && ck.exists) {
            const ckSources = Array.isArray(ck.sources) && ck.sources.length ? normalizeSources(ck.sources) : [];
            if (ckSources.length) {
              onThreadUpdate(currentThread, { sources: ckSources });
            } 
          }
        } catch (e) { console.warn('Checkpoint processing failed', e); }

        try {
          const threadRes = await getThread(userId, currentThread).catch(() => null);
          if (cancelled) return;

          if (threadRes) {
            const serverTitle = threadRes.title ??
                (typeof threadRes.question === 'string'
                  ? (threadRes.question.length > 80 ? `${threadRes.question.slice(0, 77)}...` : threadRes.question)
                  : undefined);
            
            const updates: any = {};
            if (serverTitle) updates.title = serverTitle;
            if (Object.keys(updates).length) onThreadUpdate(currentThread, updates);
          }

          try {
            const messagesResp = await getThreadMessages(userId, currentThread).catch(() => null);
            if (cancelled) return;
            if (messagesResp) {
              const arr = Array.isArray(messagesResp)
                ? messagesResp
                : (messagesResp.db && Array.isArray(messagesResp.db))
                  ? messagesResp.db
                  : (messagesResp.redis && Array.isArray(messagesResp.redis.messages))
                    ? messagesResp.redis.messages
                    : [];

              if (arr.length) {
                const mapped = arr.map((m: any) => {
                    const ts = m.createdAt ? new Date(m.createdAt) : new Date();
                    return {
                        id: String(m.id),
                        type: m.author === userId ? 'user' : 'assistant',
                        content: m.content,
                        timestamp: ts,
                        isStreaming: false,
                        skipAnimation: true 
                    };
                });

                const merged = mergeMessages(messagesRef.current, mapped);
                onThreadUpdate(currentThread, { messages: merged });
                
                // Hydrate sources from text for history
                const assistantText = merged
                    .filter((m: any) => m.type === 'assistant' && typeof m.content === 'string')
                    .map((m: any) => m.content)
                    .join('\n\n');
                const urls = extractUrlsFromText(assistantText);
                if (urls.length) {
                    const derived = buildSourcesFromUrls(urls);
                    onThreadUpdate(currentThread, { sources: derived });
                }
              }
            }
          } catch (e) {
            console.warn('messages endpoint fetch failed', e);
          }
        } catch (e) {
          console.warn('thread fetch error', e);
        }
      } catch (e) { }
    })();

    return () => { cancelled = true; };
  }, [currentThread, userId, onThreadUpdate]); 

  const updateStreamingAssistant = (threadId: string, partial: string) => {
    const current = messagesRef.current || [];
    const lastStreamingIndexReverse = current.slice().reverse().findIndex(m => m.type === 'assistant' && m.isStreaming);
    const copy = [...current];
    
    if (lastStreamingIndexReverse === -1) {
      const newMsg: Message = { id: Date.now().toString(), type: 'assistant', content: partial, timestamp: new Date(), isStreaming: true, skipAnimation: false };
      onThreadUpdate(threadId, { messages: [...copy, newMsg] });
    } else {
      const idx = copy.length - 1 - lastStreamingIndexReverse;
      const existing = copy[idx];
      const merged = { ...existing, content: (existing.content ?? '') + partial, isStreaming: true, skipAnimation: false };
      copy[idx] = merged;
      onThreadUpdate(threadId, { messages: copy });
    }
  };

  const finalizeAssistantMessage = async (threadId: string, finalText: string) => {
    const current = messagesRef.current || [];
    const copy = [...current];

    // Also try to extract URLs from final text to ensure they are captured
    const extractedUrls = extractUrlsFromText(finalText);
    if (extractedUrls.length > 0) {
       const newSources = buildSourcesFromUrls(extractedUrls);
       onThreadUpdate(threadId, { sources: newSources });
    }

    const lastStreamingIndexReverse = copy.slice().reverse().findIndex(m => m.type === 'assistant' && m.isStreaming);
    
    let newMessages: Message[];

    if (lastStreamingIndexReverse === -1) {
      const msgToSave: Message = { 
        id: Date.now().toString(), 
        type: 'assistant', 
        content: finalText, 
        timestamp: new Date(), 
        isStreaming: false, 
        skipAnimation: false 
      };
      newMessages = [...copy, msgToSave];
    } else {
      const idx = copy.length - 1 - lastStreamingIndexReverse;
      const msgToSave = { 
        ...copy[idx], 
        content: finalText, 
        isStreaming: false, 
        skipAnimation: false 
      }; 
      copy[idx] = msgToSave;
      newMessages = copy;
    }
    
    onThreadUpdate(threadId, { messages: newMessages });
    try { await postMessage(userId, threadId, { author: 'assistant', content: finalText }); } catch (e) { console.warn('persist assistant failed', e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !currentThread) return;
    const currentInput = input.trim();

    const userMessage: Message = { id: Date.now().toString(), type: 'user', content: currentInput, timestamp: new Date(), skipAnimation: false };
    const updatedMessages = [...(messagesRef.current || []), userMessage];
    onThreadUpdate(currentThread, { messages: updatedMessages, timestamp: new Date() });

    if ((messagesRef.current || []).length === 0) {
      const title = currentInput.slice(0, 50) + (currentInput.length > 50 ? '...' : '');
      onThreadUpdate(currentThread, { title, preview: currentInput });
    }

    setInput("");
    setIsLoading(true);

    const assistantPlaceholder: Message = { id: (Date.now() + 1).toString(), type: 'assistant', content: "", timestamp: new Date(), isStreaming: true, skipAnimation: false };
    onThreadUpdate(currentThread, { messages: [...updatedMessages, assistantPlaceholder] });

    const thinkingSteps = generateThinkingSteps(currentInput);
    onThreadUpdate(currentThread, { thinkingSteps });

    try {
      await createThread({ user_id: userId, thread_id: currentThread, question: currentInput });
    } catch (err) { console.warn('createThread failed', err); }
    try {
      await postMessage(userId, currentThread, { author: userId, content: currentInput });
    } catch (err) { console.warn('postMessage user failed', err); }

    try {
      if (sseControllerRef.current?.close) {
        try { sseControllerRef.current.close(); } catch { }
        sseControllerRef.current = null;
      }

      const controller = await startStreamWithCheckpoint({
        user_id: userId,
        thread_id: currentThread,
        question: currentInput,
        onEvent: async (ev: any) => {
          try {
            const event = ev?.event ?? 'message';
            const payload = ev?.payload ?? ev;

            if (event === 'checkpoint') {
              if (payload?.sources) {
                // FIXED: Inject the current message ID into the sources!
                // This ensures specific sources are linked to this specific generation
                const linkedSources = normalizeSources(payload.sources).map(s => ({
                   ...s,
                   messageId: assistantPlaceholder.id 
                }));
                onThreadUpdate(currentThread, { sources: linkedSources });
              }
              if (payload?.draft_preview) {
                updateStreamingAssistant(currentThread, payload.draft_preview);
              }
            } else if (event === 'node_output') {
              const chunk = payload?.text ?? payload?.chunk ?? payload;
              if (typeof chunk === 'string' && chunk.length) {
                updateStreamingAssistant(currentThread, chunk);
              } else if (payload?.draft_preview) {
                updateStreamingAssistant(currentThread, payload.draft_preview);
              }
            } else if (event === 'finished') {
              const final = payload?.report ?? payload?.final_text ?? payload?.text ?? '';
              await finalizeAssistantMessage(currentThread, final || '(no content)');
              if (payload?.sources) {
                const linkedSources = normalizeSources(payload.sources).map(s => ({
                   ...s,
                   messageId: assistantPlaceholder.id 
                }));
                onThreadUpdate(currentThread, { sources: linkedSources });
              }
              const finalSteps = thinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
              onThreadUpdate(currentThread, { thinkingSteps: finalSteps });
            } else if (event === 'error') {
              const msg = payload?.message ?? 'Agent error';
              await finalizeAssistantMessage(currentThread, `Error: ${msg}`);
              toast({ title: 'Agent error', description: msg, variant: 'destructive' });
            } else {
              if (typeof payload === 'string' && payload.length) {
                updateStreamingAssistant(currentThread, payload);
              }
            }
          } catch (err) { console.warn('onEvent handler failed', err); }
        },
        onOpen: () => { },
        onError: (err) => {
          console.error('Stream error', err);
          toast({ title: 'Stream error', description: 'Connection to research stream failed.', variant: 'destructive' });
          const notStreaming = (messagesRef.current || []).map(m => m.isStreaming ? { ...m, isStreaming: false } : m);
          onThreadUpdate(currentThread, { messages: notStreaming });
          setIsLoading(false);
        }
      });
      sseControllerRef.current = controller;
    } catch (err) {
      console.error('Failed to start research stream', err);
      toast({ title: 'Error', description: 'Failed to start research stream. Try again.', variant: 'destructive' });
      await finalizeAssistantMessage(currentThread, "I couldn't start the research stream — please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleExportReport = () => {
    const reportContent = displayMessages.filter(m => m.type === 'assistant').map(m => m.content).join('\n\n---\n\n');
    const blob = new Blob([reportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-research-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!currentThread) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto p-8">
          <div className="p-4 bg-accent/10 rounded-full w-fit mx-auto">
            <TrendingUp className="h-12 w-12 text-accent" />
          </div>
          <h2 className="text-2xl font-semibold">Start Your Financial Research</h2>
          <p className="text-muted-foreground">
            Select an existing thread from the sidebar or create a new research thread to begin your analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Financial Research Assistant</h2>
          </div>
        </div>
        <Button onClick={handleExportReport} variant="outline" size="sm" className="finance-transition hover:bg-accent/10">
          <Download className="h-4 w-4 mr-2" /> Export Report
        </Button>
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1 px-4">
        <div className="space-y-6 py-6">
          {displayMessages.map((message) => (
            <div 
              key={message.id}
              ref={(el) => {
                if (el) messageElementRefs.current.set(message.id, el);
                else messageElementRefs.current.delete(message.id);
              }}
              data-message-id={message.id}
            >
              <ChatMessage 
                message={message} 
                onAnimationComplete={handleAnimationComplete} 
              />
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Bot className="h-4 w-4" />
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full typing-dots"></div>
                <div className="w-2 h-2 bg-primary rounded-full typing-dots"></div>
                <div className="w-2 h-2 bg-primary rounded-full typing-dots"></div>
              </div>
              <span className="text-sm">Analyzing financial data...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me about stocks, earnings, market analysis, or any financial research..."
              className="min-h-[60px] max-h-[120px] pr-12 resize-none finance-transition focus:ring-primary/50"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || isLoading}
              className="absolute bottom-2 right-2 h-8 w-8 p-0 finance-bounce"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span>{input.length}/2000</span>
          </div>
        </form>
      </div>
    </div>
  );
}



