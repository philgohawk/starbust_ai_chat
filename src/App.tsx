import { useState, useRef, useEffect } from "react";
import { Send, Database, Loader2, AlertCircle } from "lucide-react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  data?: Record<string, unknown>[];
  error?: string;
};

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            error: json.error || "Something went wrong",
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.text || "",
          sql: json.sql,
          data: json.data,
          error: json.error,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          error: err instanceof Error ? err.message : "Network error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="rounded-lg bg-emerald-100 p-2">
          <Database className="size-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="font-semibold text-slate-900">Starburst Data Explorer</h1>
          <p className="text-xs text-slate-500">
            Ask questions in natural language • Powered by Gemini + Starburst MCP
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-slate-600">
                Ask anything about your data. For example:
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  "Show me all catalogs",
                  "What schemas are in the tpch catalog?",
                  "List 25 items from kaggle_tx_data",
                ].map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => setInput(q)}
                      className="text-emerald-600 hover:text-emerald-700 hover:underline"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-400">
                Uses{" "}
                <a
                  href="https://docs.starburst.io/starburst-galaxy/starburst-ai/mcp-server.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-emerald-600"
                >
                  Starburst MCP
                </a>{" "}
                best practices
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-200 bg-white shadow-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="space-y-3">
                    {msg.error && (
                      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                        <AlertCircle className="size-4 shrink-0" />
                        {msg.error}
                      </div>
                    )}
                    {msg.content && (
                      <div className="prose prose-sm max-w-none">
                        <p className="whitespace-pre-wrap text-slate-700">
                          {msg.content}
                        </p>
                      </div>
                    )}
                    {msg.sql && (
                      <pre className="overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                        <code>{msg.sql}</code>
                      </pre>
                    )}
                    {msg.data !== undefined && msg.data.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100">
                              {(Object.keys(msg.data[0] ?? {}) as string[]).map(
                                (k) => (
                                  <th
                                    key={k}
                                    className="px-3 py-2 font-medium text-slate-700"
                                  >
                                    {k}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.data.slice(0, 100).map((row, ri) => (
                              <tr
                                key={ri}
                                className="border-b border-slate-100 hover:bg-slate-50"
                              >
                                {Object.values(row).map((v, vi) => (
                                  <td
                                    key={vi}
                                    className="px-3 py-2 font-mono text-slate-600"
                                  >
                                    {String(v ?? "NULL")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {msg.data.length > 100 && (
                          <p className="px-3 py-2 text-xs text-slate-500">
                            Showing first 100 of {msg.data.length} rows
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="mb-4 flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Loader2 className="size-4 animate-spin text-emerald-600" />
                <span className="text-sm text-slate-600">Querying Starburst…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] sm:px-6"
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your data…"
              className="flex-1 bg-transparent px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
            >
              <Send className="size-5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
