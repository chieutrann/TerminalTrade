import React from 'react';
import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import ChartWidget from '../components/ChartWidget';

export default function TradingTerminal() {
  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <ChartWidget />
        </div>
        <Sidebar />
      </div>
    </div>
  );
}
