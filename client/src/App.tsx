import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/layout/Navigation";
import Home from "@/pages/Home";
import Profiles from "@/pages/Profiles";
import ProfileDetail from "@/pages/ProfileDetail";
import NewGame from "@/pages/NewGame";
import GameTracker from "@/pages/GameTracker";
import History from "@/pages/History";
import Rules from "@/pages/Rules";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/profiles" component={Profiles} />
      <Route path="/profiles/:id" component={ProfileDetail} />
      <Route path="/new" component={NewGame} />
      <Route path="/game/:id" component={GameTracker} />
      <Route path="/history" component={History} />
      <Route path="/rules" component={Rules} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Navigation />
          <Router />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
