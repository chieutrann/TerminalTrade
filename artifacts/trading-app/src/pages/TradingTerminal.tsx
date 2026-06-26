import React from 'react';
import TopBar from '../components/TopBar';
import { IndicatorsPanel, ProfilesPanel } from '../components/Sidebar';
import ChartWidget from '../components/ChartWidget';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { BarChart3, SlidersHorizontal, UserRoundCog } from 'lucide-react';

type BottomPanel = 'indicators' | 'profiles' | null;

function BottomNav({ activePanel, onChange }: { activePanel: BottomPanel; onChange: (panel: BottomPanel) => void }) {
  const itemClass = (active: boolean) =>
    `flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
      active ? 'text-primary' : 'text-muted-foreground'
    }`;

  return (
    <div className="h-14 shrink-0 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="flex h-full items-center">
        <button type="button" className={itemClass(activePanel === null)} onClick={() => onChange(null)}>
          <BarChart3 className="h-5 w-5" />
          <span>Chart</span>
        </button>
        <button type="button" className={itemClass(activePanel === 'indicators')} onClick={() => onChange('indicators')}>
          {/* <SlidersHorizontal className="h-5 w-5" /> */}
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity w-5 h-5 mb-1" aria-hidden="true" data-replit-metadata="artifacts/mobile-terminal/src/pages/TradingTerminal.tsx:104:10" data-component-name="Activity"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path></svg>
          <span>Indicators</span>
        </button>
        <button type="button" className={itemClass(activePanel === 'profiles')} onClick={() => onChange('profiles')}>
          <UserRoundCog className="h-5 w-5" />
          <span>Profiles</span>
        </button>
      </div>
    </div>
  );
}

export default function TradingTerminal() {
  const [activePanel, setActivePanel] = React.useState<BottomPanel>(null);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <ChartWidget />
      </div>
      <BottomNav activePanel={activePanel} onChange={setActivePanel} />

      <Drawer open={activePanel !== null} onOpenChange={(open) => !open && setActivePanel(null)}>
        <DrawerContent className="max-h-[82dvh] border-border bg-card">
          <DrawerHeader>
            <DrawerTitle>{activePanel === 'profiles' ? 'Profiles' : 'Indicators'}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {activePanel === 'profiles' ? <ProfilesPanel /> : <IndicatorsPanel />}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
