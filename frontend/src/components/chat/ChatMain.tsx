
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Send, Download, Bot, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ChatMessage from "./ChatMessage";

import {
  createThread,
  postMessage,
  getThread,
  getThreadMessages,
  startResearchStream,
  getCheckpoint,
  startStreamWithCheckpoint,
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
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
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
}

function generateThinkingSteps(query: string): ThinkingStep[] {
  const base = [
    { id: "1", action: "Query Processing", description: `Analyzing your request about "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"`, status: 'completed' as const, timestamp: new Date() },
    { id: "2", action: "Financial Data Search", description: "Searching SEC filings, earnings reports, and market data", status: 'running' as const, timestamp: new Date(Date.now() + 1000) },
    { id: "3", action: "News & Analysis", description: "Scanning recent financial news and analyst reports", status: 'pending' as const, timestamp: new Date(Date.now() + 2000) },
    { id: "4", action: "Data Synthesis", description: "Combining insights from multiple sources", status: 'pending' as const, timestamp: new Date(Date.now() + 3000) }
  ];
  return base;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ChatMain({ currentThread, messages, onThreadUpdate }: ChatMainProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const lastHydratedRef = useRef<{ thread?: string; ts?: number }>({});
  const HYDRATE_COOLDOWN_MS = 1000;



  const sseControllerRef = useRef<{ es?: EventSource; close?: () => void; checkpoint?: any } | null>(null);


  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);


  const [userId, setUserId] = useState<string>('anonymous');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    (async () => {
      try {
        const me = await getCurrentUser();
        console.log('Current user', me.id);
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
    timestamp: new Date()
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


  function mergeSources(preferred: Source[] = [], fallback: Source[] = []): Source[] {
    const map = new Map<string, Source>();
    for (const s of fallback) {
      if (s?.url) map.set(s.url, s);
    }
    for (const s of preferred) {
      if (s?.url) map.set(s.url, { ...map.get(s.url), ...s });
    }
    return Array.from(map.values());
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


      if (!last['warned'] || now - (last['warnedTs'] || 0) > 1000) {

        console.warn(`Skipping hydrate: thread ${currentThread} hydrated ${now - (last.ts || 0)}ms ago. ` +
          `Hint: memoize onThreadUpdate in parent to avoid rerenders.`);
        lastHydratedRef.current = { ...last, warned: true, warnedTs: now } as any;
      }
      return;
    }


    lastHydratedRef.current = { thread: currentThread, ts: now };

    (async () => {
      try {















        const ck = await getCheckpoint(userId, currentThread).catch(() => ({ exists: false }));
        if (cancelled) return;

        try {
          if (ck && ck.exists) {

            const ckSources = Array.isArray(ck.sources) && ck.sources.length ? normalizeSources(ck.sources) : [];
            if (ckSources.length) {
              onThreadUpdate(currentThread, { sources: ckSources });
            } else {

              const candidateTextParts: string[] = [];
              if (typeof ck.draft === 'string' && ck.draft.length) candidateTextParts.push(ck.draft);
              if (typeof ck.report === 'string' && ck.report.length) candidateTextParts.push(ck.report);

              if (Array.isArray(ck.messages)) {
                candidateTextParts.push(...(ck.messages.filter((m: any) => m.author === 'assistant' && typeof m.content === 'string').map((m: any) => m.content)));
              }
              const urls = extractUrlsFromText(candidateTextParts.join('\n\n'));
              if (urls.length) {
                const derived = buildSourcesFromUrls(urls);
                onThreadUpdate(currentThread, { sources: derived });
              }
            }


            if (ck.draft) {
              onThreadUpdate(currentThread, {
                messages: [{ id: 'draft_preview', type: 'assistant', content: ck.draft, timestamp: new Date(), isStreaming: false }]
              });
            }
          }
        } catch (e) {
          console.warn('Checkpoint processing failed', e);
        }























































































        try {

          const threadRes = await getThread(userId, currentThread).catch(() => null);
          if (cancelled) return;

          if (threadRes) {

            if (Array.isArray(threadRes.messages) && threadRes.messages.length > 0) {
              const mapped = threadRes.messages.map((m: any) => ({
                id: String(m.id),
                type: m.author === userId ? 'user' : 'assistant',
                content: m.content,
                timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
                isStreaming: false
              }));
              onThreadUpdate(currentThread, { messages: mapped });
            }


            const threadSources = Array.isArray(threadRes.sources) && threadRes.sources.length ? normalizeSources(threadRes.sources) : [];
            if (threadSources.length) {
              onThreadUpdate(currentThread, { sources: threadSources });
            } else {
              try {

                const candidateParts: string[] = [];
                if (typeof threadRes.report === 'string' && threadRes.report.length) candidateParts.push(threadRes.report);
                if (typeof threadRes.draft === 'string' && threadRes.draft.length) candidateParts.push(threadRes.draft);

                if (Array.isArray(threadRes.messages) && threadRes.messages.length) {
                  candidateParts.push(...threadRes.messages
                    .filter((m: any) => m.author === 'assistant' && typeof m.content === 'string')
                    .map((m: any) => m.content));
                }

                const candidateText = candidateParts.join('\n\n');
                const urls = extractUrlsFromText(candidateText);

                if (urls.length) {
                  const derived = buildSourcesFromUrls(urls);
                  onThreadUpdate(currentThread, { sources: derived });
                }
              } catch (e) {
                console.warn('Failed to derive sources from threadRes content', e);
              }
            }


            try {
              const serverTitle =
                threadRes.title ??
                (typeof threadRes.question === 'string'
                  ? (threadRes.question.length > 80 ? `${threadRes.question.slice(0, 77)}...` : threadRes.question)
                  : undefined);

              const preview = threadRes.preview ?? threadRes.question ?? undefined;
              const ts = threadRes.updatedAt ? new Date(threadRes.updatedAt) : threadRes.createdAt ? new Date(threadRes.createdAt) : undefined;

              const updates: any = {};
              if (serverTitle) updates.title = serverTitle;
              if (typeof preview === 'string') updates.preview = preview;
              if (ts) updates.timestamp = ts;

              if (Object.keys(updates).length) onThreadUpdate(currentThread, updates);
            } catch (e) {
              console.warn('Failed to sync thread title/preview to parent', e);
            }
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
                const mapped = arr.map((m: any) => ({
                  id: String(m.id),
                  type: m.author === userId ? 'user' : 'assistant',
                  content: m.content,
                  timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
                  isStreaming: false
                }));
                onThreadUpdate(currentThread, { messages: mapped });
              }


              try {
                const respSources = messagesResp.result?.sources || messagesResp.sources;
                if (Array.isArray(respSources) && respSources.length) {
                  onThreadUpdate(currentThread, { sources: normalizeSources(respSources) });
                } else {
                  const assistantText = (arr || [])
                    .filter((m: any) => m.author === 'assistant' && typeof m.content === 'string')
                    .map((m: any) => m.content)
                    .join('\n\n');

                  const urls = extractUrlsFromText(assistantText);
                  if (urls.length) {
                    const derived = buildSourcesFromUrls(urls);
                    onThreadUpdate(currentThread, { sources: derived });
                  }
                }
              } catch (e) {
                console.warn('Failed to derive sources from messagesResp', e);
              }
            }
          } catch (e) {

            console.warn('messages endpoint fetch failed', e);
          }
        } catch (e) {
          console.warn('thread fetch error', e);
        } finally {

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
      const newMsg: Message = { id: Date.now().toString(), type: 'assistant', content: partial, timestamp: new Date(), isStreaming: true };
      onThreadUpdate(threadId, { messages: [...copy, newMsg] });
    } else {
      const idx = copy.length - 1 - lastStreamingIndexReverse;
      const existing = copy[idx] ?? { id: Date.now().toString(), type: 'assistant', content: '', timestamp: new Date(), isStreaming: true };
      const merged = { ...existing, content: (existing.content ?? '') + partial, isStreaming: true };
      copy[idx] = merged;
      onThreadUpdate(threadId, { messages: copy });
    }
  };


  const finalizeAssistantMessage = async (threadId: string, finalText: string) => {
    const current = messagesRef.current || [];
    const copy = [...current];
    const lastStreamingIndexReverse = copy.slice().reverse().findIndex(m => m.type === 'assistant' && m.isStreaming);
    if (lastStreamingIndexReverse === -1) {
      const msg: Message = { id: Date.now().toString(), type: 'assistant', content: finalText, timestamp: new Date(), isStreaming: false };
      onThreadUpdate(threadId, { messages: [...copy, msg] });
      try { await postMessage(userId, threadId, { author: 'assistant', content: finalText }); } catch (e) { console.warn('persist assistant failed', e); }
      return;
    }
    const idx = copy.length - 1 - lastStreamingIndexReverse;
    const updated = { ...copy[idx], content: finalText, isStreaming: false };
    copy[idx] = updated;
    onThreadUpdate(threadId, { messages: copy });
    try { await postMessage(userId, threadId, { author: 'assistant', content: finalText }); } catch (e) { console.warn('persist assistant failed', e); }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !currentThread) return;
    const currentInput = input.trim();


    const userMessage: Message = { id: Date.now().toString(), type: 'user', content: currentInput, timestamp: new Date() };
    const updatedMessages = [...(messagesRef.current || []), userMessage];
    onThreadUpdate(currentThread, { messages: updatedMessages, timestamp: new Date() });


    if ((messagesRef.current || []).length === 0) {
      const title = currentInput.slice(0, 50) + (currentInput.length > 50 ? '...' : '');
      onThreadUpdate(currentThread, { title, preview: currentInput });
    }

    setInput("");
    setIsLoading(true);


    const assistantPlaceholder: Message = { id: (Date.now() + 1).toString(), type: 'assistant', content: "", timestamp: new Date(), isStreaming: true };
    onThreadUpdate(currentThread, { messages: [...(messagesRef.current || []), userMessage, assistantPlaceholder] });

    const thinkingSteps = generateThinkingSteps(currentInput);
    onThreadUpdate(currentThread, { thinkingSteps });


    try {
      await createThread({ user_id: userId, thread_id: currentThread, question: currentInput });
    } catch (err) {
      console.warn('createThread failed', err);
    }

    try {
      await postMessage(userId, currentThread, { author: userId, content: currentInput });
    } catch (err) {
      console.warn('postMessage user failed', err);
    }


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
                onThreadUpdate(currentThread, { sources: normalizeSources(payload.sources) });
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
                onThreadUpdate(currentThread, { sources: normalizeSources(payload.sources) });
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
          } catch (err) {
            console.warn('onEvent handler failed', err);
          }
        },
        onOpen: () => {

        },
        onError: (err) => {
          console.error('Stream error', err);
          toast({ title: 'Stream error', description: 'Connection to research stream failed.', variant: 'destructive' });

          const notStreaming = (messagesRef.current || []).map(m => m.isStreaming ? { ...m, isStreaming: false } : m);
          onThreadUpdate(currentThread, { messages: notStreaming });
          setIsLoading(false);
        }
      });


      sseControllerRef.current = controller;


      if (controller?.checkpoint && controller.checkpoint.exists) {
        const ck = controller.checkpoint;
        if (ck.sources && ck.sources.length) {
          onThreadUpdate(currentThread, { sources: normalizeSources(ck.sources) });
        }
        if (ck.draft) updateStreamingAssistant(currentThread, ck.draft);
        if (ck.report) finalizeAssistantMessage(currentThread, ck.report);
      }
    } catch (err) {
      console.error('Failed to start research stream', err);
      toast({ title: 'Error', description: 'Failed to start research stream. Try again.', variant: 'destructive' });
      await finalizeAssistantMessage(currentThread, "I couldn't start the research stream — please try again.");
    } finally {
      setIsLoading(false);
    }
  };


  function closeActiveStream() {
    if (sseControllerRef.current) {
      try { sseControllerRef.current.close(); } catch (e) { /* ignore */ }
      sseControllerRef.current = null;
    }
  }





























































































































































































  useEffect(() => {

    return () => {
      if (sseControllerRef.current?.close) {
        try { sseControllerRef.current.close(); } catch { }
        sseControllerRef.current = null;
      }
    };
  }, []);

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
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Financial Research Assistant</h2>
            <p className="text-sm text-muted-foreground">Powered by Google Gemini AI</p>
          </div>
        </div>

        <Button
          onClick={handleExportReport}
          variant="outline"
          size="sm"
          className="finance-transition hover:bg-accent/10"
        >
          <Download className="h-4 w-4 mr-2" /> Export Report
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-4">
        <div className="space-y-6 py-6">
          {displayMessages.map((message) => (
            <ChatMessage key={message.id} message={message} />
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

      {/* Input Area */}
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
