import { QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient, Router } from "@/pages/app-pages";
import { useRequestLoading } from "@/lib/request-loader";

function GlobalRequestLoader() {
    const loading = useRequestLoading();
    if (!loading) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/45 backdrop-blur-[2px]" role="status" aria-live="polite" aria-label="Loading">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-lg">
                <span className="loader" />
                Loading…
            </div>
        </div>
    );
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <ErrorBoundary>
                        <Router />
                    </ErrorBoundary>
                </WouterRouter>
                <GlobalRequestLoader />
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    );
}

export default App;
