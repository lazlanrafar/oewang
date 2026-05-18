export default function AppsPage() {
  return (
    <div className="flex flex-col h-full bg-background p-6">
      <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
      <p className="mt-2 text-muted-foreground">
        WhatsApp integration is now powered exclusively by Twilio. Configure
        your Twilio credentials in the environment settings.
      </p>
    </div>
  );
}
