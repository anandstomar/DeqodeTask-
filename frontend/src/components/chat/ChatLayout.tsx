import { useState, useCallback, useMemo, useEffect} from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChatSidebar from "./chatsidebar";
import ChatMain, { type ThinkingStep, type Source, type Message } from "./chatmain";
import ChatSources from "./chatsources";
import { getThreads, getCurrentUser } from "@/lib/api";


export interface ChatThread {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: Message[];
  sources: Source[];
  thinkingSteps: ThinkingStep[];
}

const stripMarkdown = (text: string) => {
  if (!text) return "";
  return text
    .replace(/[#*`_]/g, '') // Remove markdown symbols
    .replace(/\n+/g, ' ')   // Replace newlines with spaces
    .trim();
};

// Helper: Normalize URL for loose matching
const normalizeUrl = (url: string) => {
  try {
    return url.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('?')[0]; 
  } catch (e) { return url.toLowerCase(); }
};

export default function ChatLayout() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThread, setCurrentThread] = useState<string | null>(null);

  // Track which message is currently being viewed
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);


useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        const uid = user?.id || localStorage.getItem('df_research_user_id');
        
        if (uid) {
          const rawThreads = await getThreads(uid);
          let arr: any[] = [];
          
          // Handle your API response structure diversity
          if (Array.isArray(rawThreads)) arr = rawThreads;
          else if (rawThreads?.db) arr = rawThreads.db;
          else if (rawThreads?.threads) arr = rawThreads.threads;
          else if (rawThreads?.rows) arr = rawThreads.rows;

          if (arr.length > 0) {
            const mapped = arr.map((t: any) => {
               const src = t.db ?? t; 
               // CRITICAL FIX: Ensure messages is an array. 
               // Even if the API returns just a lastMessage or nothing, default to empty array []
               // This prevents 'undefined' errors in the sidebar.
               const msgs = Array.isArray(src.messages) ? src.messages : [];

               const rawPreview = src.preview || (src.lastMessage?.content) || (src.question) || "";
               const cleanPreview = stripMarkdown(rawPreview).slice(0, 100);
               
               return {
                 id: src.id ?? src.threadId,
                 title: src.title || src.question || "New Research",
                //  preview: src.preview || (src.lastMessage?.content) || (src.question) || "",
                 preview: cleanPreview,
                 timestamp: src.updatedAt ? new Date(src.updatedAt) : new Date(),
                 messages: msgs, // Assigning the safe array here
                 sources: [],
                 thinkingSteps: []
               };
            });
            setThreads(mapped);
          }
        }
      } catch (e) {
        console.error("Failed to load threads", e);
      }
    })();
  }, []);



  const currentThreadData = useMemo(
    () => threads.find(t => t.id === currentThread) ?? null,
    [threads, currentThread]
  );

  // LOGIC: Filter sources based on the Active Message
  const activeSources = useMemo(() => {
    if (!currentThreadData) return [];

    // If no message is actively focused (e.g. initial load), default to showing all
    if (!activeMessageId) {
        return currentThreadData.sources || [];
    }

    const activeMsg = currentThreadData.messages.find(m => m.id === activeMessageId);
    
    // User messages usually have no sources
    if (!activeMsg || activeMsg.type === 'user') return [];

    // FILTER LOGIC
    return currentThreadData.sources.filter(source => {
      // 1. Direct Message ID Match (Highest Priority - set during streaming)
      if (source.messageId === activeMessageId) return true;

      // 2. Strict Content Match
      if (activeMsg.content.includes(source.url)) return true;

      // 3. Loose/Fuzzy URL Match (Handles trailing slashes, http/https, www)
      const cleanSource = normalizeUrl(source.url);
      if (activeMsg.content.toLowerCase().includes(cleanSource)) return true;

      return false;
    });

  }, [currentThreadData, activeMessageId]);


  const handleThreadSelect = useCallback((threadId: string) => {
    setCurrentThread(threadId);
    setActiveMessageId(null); 

    setThreads(prev => {
      const exists = prev.find(t => t.id === threadId);
      if (exists) {
        return [exists, ...prev.filter(t => t.id !== threadId)];
      }

      const newThread: ChatThread = {
        id: threadId,
        title: "New Research Thread",
        preview: "",
        timestamp: new Date(),
        messages: [],
        sources: [],
        thinkingSteps: []
      };
      return [newThread, ...prev];
    });
  }, [setThreads, setCurrentThread]);


  const handleThreadUpdate = useCallback(
    (threadId: string, updates: Partial<Omit<ChatThread, "id">>) => {
      setThreads(prev =>
        prev.map(thread => {
          if (thread.id !== threadId) return thread;

          // SMART MERGE FOR SOURCES
          // If we receive new sources, we APPEND them, not overwrite
          let newSources = thread.sources;
          if (updates.sources) {
             const incoming = updates.sources;
             const existingIds = new Set(thread.sources.map(s => s.id));
             const existingUrls = new Set(thread.sources.map(s => s.url));
             
             // Only add if ID or URL is new
             const uniqueIncoming = incoming.filter(s => 
                !existingIds.has(s.id) && !existingUrls.has(s.url)
             );
             newSources = [...thread.sources, ...uniqueIncoming];
          }

          // Use the merged sources
          return { 
             ...thread, 
             ...updates, 
             sources: updates.sources ? newSources : thread.sources 
          };
        })
      );
    },
    [setThreads]
  );


  const handleThreadDelete = useCallback((threadId: string) => {
    setThreads(prev => prev.filter(thread => thread.id !== threadId));
    setCurrentThread(curr => (curr === threadId ? null : curr));
  }, [setThreads, setCurrentThread]);

  return (
    <div className="h-screen bg-background overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <ChatSidebar
            threads={threads}
            currentThread={currentThread}
            onThreadSelect={handleThreadSelect}
            onThreadDelete={handleThreadDelete}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={30}>
          <ChatMain
            currentThread={currentThread}
            messages={currentThreadData?.messages || []}
            onThreadUpdate={handleThreadUpdate}
            onActiveMessageChange={setActiveMessageId} 
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
          <ChatSources
            currentThread={currentThread}
            thinkingSteps={currentThreadData?.thinkingSteps || []}
            sources={activeSources} 
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}


