"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Textarea } from "@/components/ui";
import { BanyanMark } from "@/components/BanyanMark";
import { SendHorizonal, MessageCircle } from "lucide-react";

/**
 * Command center chat — the conversation with the workspace's growth agent.
 *
 * Real, not simulated: messages POST to /api/chat, replies are grounded in
 * workspace records at send time, and every assistant message carries its
 * model label. When the deployment has no live model, the label says so —
 * the fallback reply is assembled from records and never pretends to be
 * generated copy.
 */

export type ChatMessageDTO = {
  id: string;
  role: string;
  content: string;
  modelLabel: string | null;
  isFallback: boolean;
  createdAt: string;
};

const MAX_LEN = 2000;

const SUGGESTIONS = [
  "What should I focus on this week?",
  "What is blocking my goal right now?",
  "What did we learn from the last experiment?",
  "What can you not do yet?",
];

export default function CommandChat({ initialMessages }: { initialMessages: ChatMessageDTO[] }) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    if (content.length > MAX_LEN) {
      setError(`Message is longer than ${MAX_LEN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    setInput("");
    const tempId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content, modelLabel: null, isFallback: false, createdAt: new Date().toISOString() },
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await res.json()) as { userMessage?: ChatMessageDTO; assistantMessage?: ChatMessageDTO; error?: string };
      if (!res.ok || !body.assistantMessage) {
        setError(body.error ?? "The message could not be answered — nothing ran in the background.");
        // Drop the optimistic bubble; the record was not returned by the server.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content); // let the user retry without retyping
        return;
      }
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== tempId);
        if (body.userMessage) next.push(body.userMessage);
        next.push(body.assistantMessage!);
        return next;
      });
    } catch {
      setError("Network error — the message was not sent. Nothing ran in the background.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <Card id="command-chat">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-medium text-charcoal">
          <BanyanMark size={20} className="rounded-sm" /> Ask Banyan
        </h2>
        <p className="text-[13px] text-muted">Reads your records, proposes, never publishes on its own</p>
      </div>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with Banyan"
        className="app-light-scroll mt-4 flex h-80 flex-col gap-3 overflow-y-auto rounded-lg border border-bark/[0.08] bg-ivory/70 p-4"
      >
        {empty && !busy ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <MessageCircle size={20} className="text-muted" aria-hidden="true" />
            <p className="max-w-sm text-[13px] leading-5 text-charcoal-soft">
              Ask about your goal, your funnel or what to do next. Answers come from your workspace records.
            </p>
            <div className="flex flex-wrap justify-center gap-2" aria-label="Suggested first questions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="h-8 rounded-lg border border-bark/15 bg-white px-3 text-[13px] text-charcoal transition-colors hover:border-bark/30"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-forest-deep px-3 py-2 text-sm leading-relaxed text-ivory sm:max-w-[75%]">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2">
                  <BanyanMark size={22} className="mt-0.5 shrink-0 rounded-sm" />
                  <div className="min-w-0 max-w-[85%] sm:max-w-[75%]">
                    <div className="whitespace-pre-wrap rounded-xl rounded-bl-sm border border-bark/10 bg-white px-3 py-2 text-sm leading-relaxed text-charcoal">
                      {m.content}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {m.isFallback
                        ? `${m.modelLabel ?? "Template fallback"} · not generated copy`
                        : m.modelLabel ?? "Assistant reply"}
                    </p>
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-start gap-2" aria-hidden="true">
                <BanyanMark size={22} className="mt-0.5 shrink-0 rounded-sm opacity-60" />
                <div className="rounded-xl rounded-bl-sm border border-bark/10 bg-white px-3 py-2 text-sm text-muted">
                  <span>Reading your records…</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-clay/[0.06] px-3 py-2 text-[13px] text-clay">
          {error}
        </p>
      )}

      <div className="mt-3">
        <label htmlFor="chat-input" className="sr-only">
          Message Banyan
        </label>
        <Textarea
          id="chat-input"
          rows={2}
          maxLength={MAX_LEN}
          placeholder="Ask about your goal, funnel or next move"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          className="resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            <kbd className="font-mono">Enter</kbd> sends · <kbd className="font-mono">Shift Enter</kbd> new line ·{" "}
            <span className="num font-mono">
              {input.length.toLocaleString()}/{MAX_LEN.toLocaleString()}
            </span>
          </p>
          <Button onClick={() => void send(input)} disabled={busy || input.trim().length === 0} size="sm">
            <SendHorizonal size={16} aria-hidden="true" /> {busy ? "Thinking…" : "Send"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
