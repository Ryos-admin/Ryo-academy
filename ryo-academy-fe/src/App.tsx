import { QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient, Router } from "@/pages/app-pages";

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <ErrorBoundary>
                        <Router />
                    </ErrorBoundary>
                </WouterRouter>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    );
}

export default App;
