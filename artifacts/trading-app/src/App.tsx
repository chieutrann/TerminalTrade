import React, { useEffect } from 'react';
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import TradingTerminal from "@/pages/TradingTerminal";
import { useTradingStore } from './store/useTradingStore';
import LoginGate from './components/LoginGate';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={TradingTerminal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const theme = useTradingStore(s => s.theme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LoginGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </LoginGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
