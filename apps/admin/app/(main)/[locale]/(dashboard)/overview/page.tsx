import { getMe } from "@workspace/modules/user/user.action";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const meResult = await getMe();

  const user = meResult.success ? meResult.data?.user : null;
  const displayName = user?.name
    ? user.name.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "there");

  return (
    <div className="flex flex-col min-h-full pb-50 relative">
      <div className="dashboard-greeting flex flex-col md:flex-row items-start md:items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-regular tracking-tight text-foreground">
            {getGreeting()} {displayName},
          </h1>
          <p className="mt-1 text-xm text-muted-foreground">
            here's a quick look at how things are going.
          </p>
        </div>
      </div>
    </div>
  );
}
