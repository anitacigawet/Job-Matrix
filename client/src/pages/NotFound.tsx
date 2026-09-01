import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-purple-900/20 via-background to-blue-900/20 p-6">
      <Card className="max-w-md w-full glass-card border-purple-500/30">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-400" />
            </div>
          </div>

          <h1 className="text-5xl font-bold gradient-text mb-2">404</h1>

          <h2 className="text-xl font-semibold text-foreground mb-4">
            Page Not Found
          </h2>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            Sorry, the page you're looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg shadow-purple-500/20"
              size="lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Job Matrix
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
