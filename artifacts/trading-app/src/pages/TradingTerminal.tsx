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
import { Activity, BarChart3, ChevronDown, ChevronUp, UserRoundCog } from 'lucide-react';

type BottomPanel = 'indicators' | 'profiles' | null;

function BottomNav({
  activePanel,
  collapsed,
  onChange,
  onToggleCollapsed,
}: {
  activePanel: BottomPanel;
  collapsed: boolean;
  onChange: (panel: BottomPanel) => void;
  onToggleCollapsed: () => void;
}) {
  const itemClass = (active: boolean) =>
    `flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
      active ? 'text-primary' : 'text-muted-foreground'
    }`;

  return (
    <>
    <div className={`${collapsed ? 'flex sm:hidden' : 'hidden'} min-h-8 w-full max-w-full shrink-0 items-center justify-center border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur`}>
      <button
        type="button"
        className="flex h-8 min-w-24 items-center justify-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={onToggleCollapsed}
        aria-label="Show helper bar"
      >
        <ChevronUp className="h-4 w-4" />
        <span>Tools</span>
      </button>
    </div>

    <div className={`${collapsed ? 'hidden sm:block' : 'block'} min-h-14 w-full max-w-full shrink-0 overflow-x-hidden border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur`}>
      <div className="flex h-14 min-w-0 items-center">
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
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground sm:hidden"
          onClick={onToggleCollapsed}
          aria-label="Hide helper bar"
        >
          <ChevronDown className="h-5 w-5" />
          <span>Hide</span>
        </button>
      </div>
    </div>
    </>
  );
}

export default function TradingTerminal() {
  const [activePanel, setActivePanel] = React.useState<BottomPanel>(null);
  const [bottomNavCollapsed, setBottomNavCollapsed] = React.useState(false);

  return (
    <div className="flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <ChartWidget />
      </div>
      <BottomNav
        activePanel={activePanel}
        collapsed={bottomNavCollapsed}
        onChange={setActivePanel}
        onToggleCollapsed={() => setBottomNavCollapsed((collapsed) => !collapsed)}
      />

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
