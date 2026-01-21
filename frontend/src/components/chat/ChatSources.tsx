import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  ExternalLink,
  Search,
  Database,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  Loader2
} from "lucide-react";

interface ThinkingStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed';
  timestamp: Date;
}

interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  type: 'news' | 'filing' | 'analysis' | 'data';
  relevance: number;
  date: Date;
  messageId?: string;
}

interface ChatSourcesProps {
  currentThread: string | null;
  thinkingSteps: ThinkingStep[];
  sources: Source[];
}

export default function ChatSources({ currentThread, thinkingSteps, sources }: ChatSourcesProps) {

  const getStatusIcon = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-finance-green flex-shrink-0" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    }
  };

  const getSourceIcon = (type: Source['type']) => {
    switch (type) {
      case 'filing':
        return <FileText className="h-4 w-4 text-finance-blue-primary flex-shrink-0" />;
      case 'analysis':
        return <TrendingUp className="h-4 w-4 text-finance-gold flex-shrink-0" />;
      case 'news':
        return <Search className="h-4 w-4 text-finance-green flex-shrink-0" />;
      case 'data':
        return <Database className="h-4 w-4 text-primary flex-shrink-0" />;
    }
  };

  const getSourceTypeBadge = (type: Source['type']) => {
    const variants = {
      filing: "secondary",
      analysis: "outline",
      news: "default",
      data: "secondary"
    } as const;

    return (
      <Badge variant={variants[type]} className="text-[10px] px-1.5 h-5 flex-shrink-0">
        {type.toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  };

  const getHostname = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname;
    } catch (e) {
      return urlStr;
    }
  };

  if (!currentThread) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-3">
          <Brain className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            Research insights and sources will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full max-w-full flex flex-col bg-background border-l border-border overflow-hidden">
      <div className="p-4 border-b border-border flex-shrink-0">
        <h3 className="font-semibold flex items-center">
          <Brain className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
          <span className="truncate">Research Trace</span>
        </h3>
      </div>

      <ScrollArea className="flex-1 w-full overflow-x-hidden">
        <div className="p-4 space-y-6 w-full max-w-full">
          
          <Card className="finance-shadow w-full overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">AI Thinking Process</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {thinkingSteps.map((step) => (
                <div key={step.id} className="flex items-start space-x-3 w-full">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(step.status)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight break-words">{step.action}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                        {step.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all leading-snug">
                        {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Separator />

          <div className="space-y-3 w-full min-w-0">
            <h4 className="text-sm font-medium text-foreground truncate">Research Sources</h4>

            {sources.length === 0 ? (
                <div className="text-center py-8 px-4 border-2 border-dashed border-border/50 rounded-lg">
                  <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No specific sources cited in this section.
                  </p>
                </div>
            ) : (
                sources.map((source) => (
                <Card key={source.id} className="finance-shadow hover:finance-glow finance-transition cursor-pointer w-full overflow-hidden">
                    <CardContent className="p-3.5">
                    <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start space-x-2 flex-1 min-w-0">
                            {getSourceIcon(source.type)}
                            <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-medium line-clamp-2 mb-1.5 break-all leading-tight">
                                {source.title}
                            </h5>
                            <div className="flex items-center flex-wrap gap-2">
                                {getSourceTypeBadge(source.type)}
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {Math.round(source.relevance * 100)}% relevant
                                </span>
                            </div>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 h-6 w-6 flex-shrink-0 -mr-1 -mt-1"
                            onClick={(e) => {
                            e.stopPropagation();
                            window.open(source.url, '_blank');
                            }}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-3 break-all leading-snug">
                        {source.snippet}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground gap-3 pt-1 border-t border-border/50 mt-1">
                        <div className="flex-1 min-w-0" title={source.url}>
                            <p className="truncate font-mono opacity-80">
                                {getHostname(source.url)}
                            </p>
                        </div>
                        <span className="whitespace-nowrap flex-shrink-0 opacity-80">{formatDate(source.date)}</span>
                        </div>
                    </div>
                    </CardContent>
                </Card>
                ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}









