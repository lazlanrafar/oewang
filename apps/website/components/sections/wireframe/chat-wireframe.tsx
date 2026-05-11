export function ChatWireframe() {
  const messages = [
    { role: "user", text: "Where did I overspend this month?" },
    {
      role: "assistant",
      text: "You overspent in Food (+$96), Transport (+$44), and Entertainment (+$38).",
    },
    { role: "user", text: "Show me what to adjust next week" },
  ];

  return (
    <div className="border border-border overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="w-8 h-8 rounded-full bg-muted-foreground/20" />
        <div>
          <div className="w-24 h-3 rounded bg-muted-foreground/20 mb-1" />
          <div className="w-16 h-2 rounded bg-muted-foreground/10" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-muted/10">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg ${
                msg.role === "user"
                  ? "bg-foreground text-background"
                  : "bg-muted border border-border"
              }`}
            >
              <div className="w-full h-3 rounded bg-current/20 mb-1" />
              <div className="w-3/4 h-3 rounded bg-current/10" />
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-8 rounded bg-background border border-border" />
          <div className="w-16 h-8 rounded bg-foreground/80" />
        </div>
      </div>
    </div>
  );
}
