import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import NotFound from "./NotFound";

export default function ShowroomGmailConnected() {
  const isShowroom = import.meta.env.VITE_SHOWROOM_MODE === "true";

  useEffect(() => {
    if (!isShowroom) return;
    window.opener?.postMessage({ type: "job-matrix-gmail-connected" }, window.location.origin);
  }, [isShowroom]);

  if (!isShowroom) return <NotFound />;

  return (
    <main className="min-h-screen bg-background p-6 text-foreground" data-agent-status="showroom-gmail-connected">
      <Card className="mx-auto mt-16 max-w-md glass-card border-green-500/30">
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-400" />Showroom connection complete</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Gmail connection was simulated inside the deterministic showroom. No Google account or external service was contacted.</p>
          <Button type="button" onClick={() => window.close()}>Close this window</Button>
        </CardContent>
      </Card>
    </main>
  );
}
