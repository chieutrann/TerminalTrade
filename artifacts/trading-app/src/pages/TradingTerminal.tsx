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
import { Activity, BarChart3, UserRoundCog } from 'lucide-react';

type BottomPanel = 'indicators' | 'profiles' | null;

function BottomNav({ activePanel, onChange }: { activePanel: BottomPanel; onChange: (panel: BottomPanel) => void }) {
  const itemClass = (active: boolean) =>
    `flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
      active ? 'text-primary' : 'text-muted-foreground'
    }`;

  return (
    <div className="h-14 w-full max-w-full shrink-0 overflow-x-hidden border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="flex h-full min-w-0 items-center">
        <button type="button" className={itemClass(activePanel === null)} onClick={() => onChange(null)}>
          <BarChart3 className="h-5 w-5" />
          <span>Chart</span>
        </button>
        <button type="button" className={itemClass(activePanel === 'indicators')} onClick={() => onChange('indicators')}>
          <Activity className="mb-1 h-5 w-5" />
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
    <div className="flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
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
