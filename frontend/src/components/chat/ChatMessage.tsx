import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Bot, Copy, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// Make sure this path matches your file structure
import TypewriterText from "./typewriters"; 

import type { Message } from "./chatmain";

interface ChatMessageProps {
  message: Message;
  onAnimationComplete?: (id: string) => void;
}

const typedMessageIds = new Set<string>();
if (process.env.NODE_ENV === "development") {
  typedMessageIds.clear();
}

export default function ChatMessage({ message, onAnimationComplete }: ChatMessageProps) {
  const isUser = message.type === "user";
  const [isTypedLocally, setIsTypedLocally] = useState(typedMessageIds.has(message.id));

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(message.content);
    } catch { }
  };

  const formatTime = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    if(isNaN(d.getTime())) return ""; 
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  useEffect(() => {
    if (message.isStreaming && typeof message.content === "string" && message.content.trim().length > 0) {
      typedMessageIds.add(message.id);
    }
  }, [message.id, message.isStreaming, message.content]);

  const onTypeComplete = () => {
    if (!message.isStreaming) {
      typedMessageIds.add(message.id);
      setIsTypedLocally(true);
      if (onAnimationComplete) onAnimationComplete(message.id);
    }
  };

  const TOO_LONG_THRESHOLD = 40_000;
  const skipBecauseTooLong = message.content && message.content.length > TOO_LONG_THRESHOLD;

  const shouldAnimate = 
    !isUser && 
    !message.skipAnimation && 
    !isTypedLocally && 
    !skipBecauseTooLong;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} message-slide-in`}>
      <div className={`flex ${isUser ? "flex-row-reverse" : "flex-row"} space-x-3 max-w-[85%]`}>
        <Avatar className={`w-8 h-8 ${isUser ? "ml-3" : "mr-3"} flex-shrink-0`}>
          <AvatarFallback className={isUser ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}>
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1 w-full min-w-0`}>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <span>{isUser ? "You" : "AI Assistant"}</span>
            <span>•</span>
            <span>{formatTime(message.timestamp)}</span>
          </div>

          <Card className={`p-4 w-full ${isUser ? "bg-primary text-primary-foreground finance-shadow" : "bg-card border-border/50 finance-shadow"}`}>
            <div className="text-sm w-full">
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <>
                  {shouldAnimate ? (
                    <TypewriterText
                      text={message.content}
                      speedMs={10} 
                      onComplete={onTypeComplete}
                      showCaret={true}
                      className="w-full min-w-0"
                    />
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold text-accent">{children}</strong>,
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-2 text-accent">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-semibold mb-2 text-accent">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 text-accent">{children}</h3>,
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-4">
                              <table className="min-w-full border-collapse border border-border/50">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                          tbody: ({ children }) => <tbody>{children}</tbody>,
                          tr: ({ children }) => <tr className="border-b border-border/30">{children}</tr>,
                          th: ({ children }) => <th className="border border-border/50 px-3 py-2 text-left font-semibold text-xs">{children}</th>,
                          td: ({ children }) => <td className="border border-border/30 px-3 py-2 text-xs">{children}</td>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                      {message.isStreaming && <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {!isUser && !message.isStreaming && (
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2 text-xs hover:bg-muted/50 text-muted-foreground">
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs hover:bg-muted/50 text-muted-foreground">
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs hover:bg-muted/50 text-muted-foreground">
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



