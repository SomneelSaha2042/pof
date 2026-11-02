import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import React, { Suspense } from "react";
import Home from "@/pages/home";
const Game = React.lazy(() => import("@/pages/game"));
const Account = React.lazy(() => import("@/pages/account"));
const Leaderboard = React.lazy(() => import("@/pages/leaderboard"));
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center text-primary">Loading game...</div>}>
      <Switch>
        <Route path="/" component={Home}/>
        <Route path="/game" component={Game}/>
        <Route path="/account" component={Account}/>
        <Route path="/leaderboard" component={Leaderboard}/>
        {/* Fallback to 404 */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
