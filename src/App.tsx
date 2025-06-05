
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
// AuthProvider import removed
import App from "./pages/App";
import NotFound from "./pages/NotFound";
import ActivityLogsPage from "./pages/ActivityLogsPage";

const queryClient = new QueryClient();

const AppRouter = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* AuthProvider removed from here */}
        <Routes>
          <Route path="/" element={<App />}>
            <Route path="activity-logs" element={<ActivityLogsPage />} />
            {/* Other nested routes can go here */}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default AppRouter;
