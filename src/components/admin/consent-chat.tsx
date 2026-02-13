'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Bot, User, AlertCircle, MessageSquareText } from 'lucide-react';

interface ConsentChatProps {
  consentId: string;
}

const SUGGESTIONS = [
  'What data is available for this company?',
  'What are my total sales this year?',
  'Show me overdue invoices',
  'What is my gross margin?',
];

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h3 className="text-base font-semibold mt-3 mb-1.5 first:mt-0">{children}</h3>
        ),
        h2: ({ children }) => (
          <h4 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0">{children}</h4>
        ),
        h3: ({ children }) => (
          <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>
        ),
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/60">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 border-t border-border whitespace-nowrap">{children}</td>
        ),
        tr: ({ children }) => <tr className="hover:bg-muted/30">{children}</tr>,
        hr: () => <hr className="my-2 border-border" />,
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <pre className="my-2 rounded-md bg-background/60 p-2.5 overflow-x-auto text-xs">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="rounded bg-background/60 px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export function ConsentChat({ consentId }: ConsentChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/v1/consents/${consentId}/chat`,
    }),
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== 'ready') return;
    sendMessage({ text: input });
    setInput('');
  };

  const handleSuggestion = (text: string) => {
    if (status !== 'ready') return;
    sendMessage({ text });
  };

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
    <Card className="flex flex-col h-[600px]">
      <CardContent className="flex flex-col flex-1 p-0 overflow-hidden">
        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
              <div className="rounded-full bg-muted p-4">
                <MessageSquareText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-lg tracking-tight">AI Accounting Assistant</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Ask questions about your accounting data. I can query invoices, calculate KPIs, and more.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full">
                {SUGGESTIONS.map((text) => (
                  <button
                    key={text}
                    onClick={() => handleSuggestion(text)}
                    className="text-left text-sm px-3 py-2 rounded-lg border border-border/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:border-border transition-all duration-150"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 mt-1 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === 'text') {
                    if (message.role === 'user') {
                      return (
                        <div key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    }
                    return <Markdown key={i}>{part.text}</Markdown>;
                  }
                  if (isToolUIPart(part)) {
                    if (part.state === 'output-available') return null;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-muted-foreground py-1"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Looking up data...
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 mt-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {status === 'submitted' && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-1 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 text-sm text-[#f87171] bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Something went wrong. Please try again.</span>
          </div>
        )}

        {/* Input area */}
        <form onSubmit={handleSubmit} className="border-t p-4 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your accounting data..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
