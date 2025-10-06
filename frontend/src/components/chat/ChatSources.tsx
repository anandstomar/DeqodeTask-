import { useState } from "react";
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
        return <CheckCircle className="h-4 w-4 text-finance-green" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSourceIcon = (type: Source['type']) => {
    switch (type) {
      case 'filing':
        return <FileText className="h-4 w-4 text-finance-blue-primary" />;
      case 'analysis':
        return <TrendingUp className="h-4 w-4 text-finance-gold" />;
      case 'news':
        return <Search className="h-4 w-4 text-finance-green" />;
      case 'data':
        return <Database className="h-4 w-4 text-primary" />;
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
      <Badge variant={variants[type]} className="text-xs">
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

  if (!currentThread) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-8">
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
    <div className="h-full flex flex-col bg-background border-l border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold flex items-center">
          <Brain className="h-5 w-5 mr-2 text-primary" />
          Research Trace
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <Card className="finance-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">AI Thinking Process</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {thinkingSteps.map((step, index) => (
                <div key={step.id} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(step.status)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{step.action}</p>
                      <span className="text-xs text-muted-foreground">
                        {step.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Research Sources</h4>
            
            {sources.map((source) => (
              <Card key={source.id} className="finance-shadow hover:finance-glow finance-transition cursor-pointer">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-2 flex-1">
                        {getSourceIcon(source.type)}
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-medium line-clamp-2 mb-1">
                            {source.title}
                          </h5>
                          <div className="flex items-center space-x-2">
                            {getSourceTypeBadge(source.type)}
                            <span className="text-xs text-muted-foreground">
                              {Math.round(source.relevance * 100)}% relevant
                            </span>
                          </div>
                        </div>
                     </div>
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       className="p-1 h-auto"
                       onClick={() => window.open(source.url, '_blank')}
                     >
                       <ExternalLink className="h-3 w-3" />
                     </Button>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {source.snippet}
                    </p>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{new URL(source.url).hostname}</span>
                      <span>{formatDate(source.date)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}