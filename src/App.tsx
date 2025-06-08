
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PagesApp from "./pages/App"; // Renamed import
import NotFound from "./pages/NotFound";
import UnifiedDashboardPage from "./pages/UnifiedDashboardPage";
import PostmarkPage from "./pages/PostmarkPage";
import MCPsPage from "./pages/MCPsPage";
import KnowReplyPage from "./pages/KnowReplyPage";
import EmailTestingPage from "./pages/EmailTestingPage";
import ActivityLogsPage from "./pages/ActivityLogsPage";
import { AuthProvider } from "./hooks/useAuth"; // Assuming AuthProvider should be here

const queryClient = new QueryClient();

const AppRouter = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider> {/* AuthProvider wraps Routes */}
          <Routes>
            <Route path="/" element={<PagesApp />}>
              <Route index element={<UnifiedDashboardPage />} />
              <Route path="postmark" element={<PostmarkPage />} />
              <Route path="mcps" element={<MCPsPage />} />
              <Route path="knowreply" element={<KnowReplyPage />} />
              <Route path="email-testing" element={<EmailTestingPage />} />
              <Route path="logs" element={<ActivityLogsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default AppRouter;
