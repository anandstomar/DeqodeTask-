
import { useState, useCallback, useMemo } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChatSidebar from "./ChatSidebar";
import ChatMain, { type ThinkingStep, type Source, type Message } from "./ChatMain";
import ChatSources from "./ChatSources";

export interface ChatThread {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: Message[];
  sources: Source[];
  thinkingSteps: ThinkingStep[];
}

export default function ChatLayout() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThread, setCurrentThread] = useState<string | null>(null);


  const currentThreadData = useMemo(
    () => threads.find(t => t.id === currentThread) ?? null,
    [threads, currentThread]
  );


  const handleThreadSelect = useCallback((threadId: string) => {
    setCurrentThread(threadId);

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
        prev.map(thread =>
          thread.id === threadId ? { ...thread, ...updates } : thread
        )
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
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
          <ChatSources
            currentThread={currentThread}
            thinkingSteps={currentThreadData?.thinkingSteps || []}
            sources={currentThreadData?.sources || []}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}




































































































