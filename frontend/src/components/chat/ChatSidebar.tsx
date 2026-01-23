
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Plus, MessageSquare, TrendingUp, Clock, Trash2 } from "lucide-react";
import type { ChatThread } from "./chatlayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createThread, getCurrentUser, getThreads, getThreadMessages, deleteThread } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ChatSidebarProps {
  threads?: ChatThread[];
  currentThread: string | null;
  onThreadSelect: (threadId: string) => void;
  onThreadDelete?: (threadId: string) => void;
}

export default function ChatSidebar({
  threads = [],
  currentThread,
  onThreadSelect,
  onThreadDelete,
}: ChatSidebarProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  //const [serverThreads, setServerThreads] = useState<ChatThread[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  //const [messages, setMessages] = useState<any[]>([]);

  // const normalizeThreads = (raw: any[]): ChatThread[] => {
  //   if (!Array.isArray(raw)) return [];
  //   return raw.map((t: any) => {
  //     const src = t.db ?? t;
  //     const id = src.id ?? src.threadId ?? `thread-${Date.now()}`;
  //     const title =
  //       src.title ??
  //       (typeof src.question === "string" ? (src.question.length > 80 ? `${src.question.slice(0, 77)}...` : src.question) : `Thread ${id}`);
  //     const preview = src.preview ?? (src.question ? String(src.question).slice(0, 120) : "");
  //     const messagesArr = Array.isArray(src.messages) ? src.messages : (src.db?.messages ?? []);
  //     const timestamp = src.updatedAt ? new Date(src.updatedAt) : src.createdAt ? new Date(src.createdAt) : new Date();

  //     return {
  //       id,
  //       title,
  //       preview,
  //       messages: messagesArr || [],
  //       timestamp,
  //     } as ChatThread;
  //   });
  // };




//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       setLoading(true);
//       try {
//         const user = await getCurrentUser();
//         if (!mounted) return;
//         if (user?.id) {
//           setCurrentUserId(user.id);
//           try {
//             const data = await getThreads(user.id);
//             let arr: any[] = [];
//             if (!data) arr = [];
//             else if (Array.isArray(data)) arr = data;
//             else if (Array.isArray(data.db)) arr = data.db;
//             else if (Array.isArray(data.threads)) arr = data.threads;
//             else if (data.rows && Array.isArray(data.rows)) arr = data.rows;
//             else arr = Array.isArray((data as any)) ? (data as any) : [];
//             const normalized = normalizeThreads(arr);
//             setServerThreads(normalized);
//           } catch (e) {
//             console.warn("getThreads failed", e);
//             setServerThreads([]);
//           }
//         } else {
//           setCurrentUserId(localStorage.getItem("df_research_user_id") || null);
//         }
//       } catch (e) {
//         console.warn("Failed to fetch current user / threads", e);
//       } finally {
//         if (mounted) setLoading(false);
//       }
//     })();
//     return () => {
//       mounted = false;
//     };
//   }, []);

//   useEffect(() => {
//   let isMounted = true; // Prevents state updates if component unmounts

//   if (!currentUserId || !currentThread) return;

//   (async () => {
//     try {
//       // 2. Fetch the data
//       const resp = await getThreadMessages(currentUserId, currentThread).catch(() => null);
//       console.log('Messages fetched for thread', currentThread, ':', resp.length);
      
//       if (!isMounted) return;

//       // 3. Normalize the data (using your logic)
//       const arr = resp 
//         ? (Array.isArray(resp) 
//             ? resp 
//             : (resp.db && Array.isArray(resp.db)) 
//               ? resp.db 
//               : (resp.redis && Array.isArray(resp.redis.messages))
//                 ? resp.redis.messages
//                 : [])
//         : [];

//       // 4. Update State (This triggers the re-render!)
//       setMessages(arr);
      
//     } catch (e) {
//       console.error(e);
//     }
//   })();

//   return () => { isMounted = false; };
// }, [currentUserId, currentThread]);


  // const threadsToShow = (serverThreads && serverThreads.length > 0) ? serverThreads : (threads ?? []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
        if (user?.id) {
          setCurrentUserId(user.id);
        }
    })();
  }, [currentUserId]);
 
  const threadsToShow = Array.isArray(threads) ? threads : [];

  const handleNewChat = useCallback(async () => {
    const newThreadId = `thread-${Date.now()}`;
    let userId = currentUserId;
    if (!userId) {
      userId = localStorage.getItem("df_research_user_id");
      if (!userId) {
        userId = `user-${Date.now()}`;
        localStorage.setItem("df_research_user_id", userId);
      }
    }

    const question = "New research";
    try {
      await createThread({ user_id: userId!, thread_id: newThreadId, question });
      onThreadSelect(newThreadId);
      // try {
      //   if (userId) {
      //     const data = await getThreads(userId);
      //     const arr = Array.isArray(data) ? data : (Array.isArray(data.db) ? data.db : []);
      //     setServerThreads(normalizeThreads(arr));
      //   }
      // } catch (e) { }
    } catch (err) {
      console.error("createThread failed", err);
      onThreadSelect(newThreadId);
    }
  }, [currentUserId, onThreadSelect]);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };


  const handleDeleteThreadLocal = async (threadId: string) => {
    if (!threadId) return;
    if (!currentUserId) {
      toast({ title: 'Not signed in', description: 'Cannot delete thread without a user', variant: 'destructive' });
      return;
    }

    if (!confirm('Delete this thread and all its messages? This cannot be undone.')) return;

    setIsDeletingId(threadId);
    try {
      await deleteThread(currentUserId, threadId);


      // setServerThreads(prev => prev.filter(t => t.id !== threadId));


      // if (currentThread === threadId) {
      //   try {
      //     onThreadSelect('');
      //   } catch { }
      // }


      if (typeof onThreadDelete === 'function') {
        try { onThreadDelete(threadId); } catch (e) { }
      }

      toast({ title: 'Deleted', description: 'Thread deleted', variant: 'default' });
    } catch (err: any) {
      console.error('deleteThread failed', err);
      toast({ title: 'Delete failed', description: String(err?.message ?? err), variant: 'destructive' });
    } finally {
      setIsDeletingId(null);
    }
  };


   return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="h-6 w-6 text-accent" />
          <h2 className="font-semibold text-sidebar-foreground">Research Hub</h2>
        </div>

        <Button
          onClick={handleNewChat}
          className="w-full justify-start finance-bounce"
          variant="default"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Research Thread
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-2 py-4">
          <div className="px-2 py-1">
            <h3 className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
              Recent Threads
            </h3>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sidebar-foreground/60 text-sm">
              Loading threads...
            </div>
          ) : threadsToShow.length === 0 ? (
            <div className="px-4 py-8 text-center text-sidebar-foreground/60 text-sm">
              No threads yet. Create a new research thread to get started!
            </div>
          ) : (
            threadsToShow.map((thread) => (
              <Card
                key={thread.id}
                className={`p-3 cursor-pointer finance-transition hover:bg-sidebar-accent/50 relative group ${currentThread === thread.id ? "bg-sidebar-accent border-primary/50 finance-shadow" : "bg-transparent border-sidebar-border/50"}`}
                onClick={() => onThreadSelect(thread.id)}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-medium text-sidebar-foreground line-clamp-1 pr-8">
                      {thread.title}
                    </h4>
                    <div className="flex items-center space-x-1">
                     
                      <AlertDialog>
                        <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Thread</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this research thread? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteThreadLocal(thread.id);
                              }}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={isDeletingId === thread.id}
                            >
                              {isDeletingId === thread.id ? 'Deleting…' : 'Delete'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {thread.preview && (
                    <p className="text-xs text-sidebar-foreground/80 line-clamp-2">
                      {thread.preview}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1 text-xs text-sidebar-foreground/60">
                      <MessageSquare className="h-3 w-3" />
                     <span>{thread.messages ? (thread.messages.length)/2 : 0}</span>
                    </div>

                    <div className="flex items-center space-x-1 text-xs text-sidebar-foreground/60">
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(thread.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-sidebar-foreground/60 text-center">Deep Finance Research v2.0</div>
      </div>
    </div>
  );
}

