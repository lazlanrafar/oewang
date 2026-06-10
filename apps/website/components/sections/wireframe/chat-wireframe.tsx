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
    <div className="flex h-full flex-col overflow-hidden border border-border">
      {/* Header */}
      <div className="flex items-center gap-3 border-border border-b bg-muted/30 px-4 py-3">
        <div className="h-8 w-8 rounded-full bg-muted-foreground/20" />
        <div>
          <div className="mb-1 h-3 w-24 rounded bg-muted-foreground/20" />
          <div className="h-2 w-16 rounded bg-muted-foreground/10" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-muted/10 p-4">
        {messages.map((msg) => (
          <div key={msg.text} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 ${
                msg.role === "user" ? "bg-foreground text-background" : "border border-border bg-muted"
              }`}
            >
              <div className="mb-1 h-3 w-full rounded bg-current/20" />
              <div className="h-3 w-3/4 rounded bg-current/10" />
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-border border-t bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <div className="h-8 flex-1 rounded border border-border bg-background" />
          <div className="h-8 w-16 rounded bg-foreground/80" />
        </div>
      </div>
    </div>
  );
}
