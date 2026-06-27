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

function useMobilePageScrollLock() {
  React.useEffect(() => {
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(max-width: 768px)').matches;

    if (!isMobile) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyInset: body.style.inset,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
    };

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.inset = '0';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.height = '100dvh';

    const preventPageTouchMove = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mobile-scroll="true"]')) return;
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventPageTouchMove, {
      passive: false,
      capture: false,
    });

    return () => {
      document.removeEventListener('touchmove', preventPageTouchMove);
      html.style.overflow = previous.htmlOverflow;
      html.style.overscrollBehavior = previous.htmlOverscrollBehavior;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscrollBehavior;
      body.style.position = previous.bodyPosition;
      body.style.inset = previous.bodyInset;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      body.style.height = previous.bodyHeight;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

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
  useMobilePageScrollLock();

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
          <div data-mobile-scroll="true" className="overflow-y-auto px-4 pb-6">
            {activePanel === 'profiles' ? <ProfilesPanel /> : <IndicatorsPanel />}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
