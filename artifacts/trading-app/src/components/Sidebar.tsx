import React from 'react';
import { useTradingStore, type MaConfig } from '../store/useTradingStore';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Trash2 } from 'lucide-react';

const LINE_STYLES: { label: string; value: 0 | 1 | 2 | 3 | 4 }[] = [
  { label: 'Solid', value: 0 },
  { label: 'Dotted', value: 1 },
  { label: 'Dashed', value: 2 },
  { label: 'Large Dashed', value: 3 },
  { label: 'Sparse Dotted', value: 4 },
];

function MaSection({
  label,
  id,
  config,
  onChange,
}: {
  label: string;
  id: string;
  config: MaConfig;
  onChange: (c: Partial<MaConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</Label>
        <Switch
          id={id}
          checked={config.show}
          onCheckedChange={(v) => onChange({ show: v })}
        />
      </div>
      {config.show && (
        <div className="space-y-3 pl-4 border-l-2 border-border">
          <div className="space-y-2">
            <Label className="text-xs">Period: {config.period}</Label>
            <Slider
              value={[config.period]}
              onValueChange={(v) => onChange({ period: v[0] })}
              min={1} max={100} step={1}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">{config.color}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Line Style</Label>
            <Select
              value={String(config.lineStyle)}
              onValueChange={(v) => onChange({ lineStyle: Number(v) as MaConfig['lineStyle'] })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINE_STYLES.map((s) => (
                  <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Width: {config.lineWidth}</Label>
            <Slider
              value={[config.lineWidth]}
              onValueChange={(v) => onChange({ lineWidth: v[0] as MaConfig['lineWidth'] })}
              min={1} max={4} step={1}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`${id}-value`} className="text-xs cursor-pointer">Show Value</Label>
            <Switch
              id={`${id}-value`}
              checked={config.showValue}
              onCheckedChange={(v) => onChange({ showValue: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const {
    profiles, activeProfileId, saveProfile, loadProfile, deleteProfile,
    rsiPeriod, setRsiPeriod,
    rsiSource, setRsiSource,
    rsiLineWidth, setRsiLineWidth,
    showRsi, setShowRsi,
    showRsiBb, setShowRsiBb,
    showStochRsi, setShowStochRsi,
    showDivergences, setShowDivergences,
    showMtf, setShowMtf,
    smaMa, setSmaMa,
    emaMa, setEmaMa,
    wmaMa, setWmaMa,
    obLevel, setObLevel,
    osLevel, setOsLevel
  } = useTradingStore();
  const [profileName, setProfileName] = React.useState('');
  const selectedProfile = profiles.find((profile) => profile.id === activeProfileId);

  const handleSaveProfile = () => {
    saveProfile(profileName || selectedProfile?.name || 'Default profile');
    setProfileName('');
  };

  const handleSelectProfile = (profileId: string) => {
    loadProfile(profileId);
  };

  return (
    <div className="w-80 border-l border-border bg-card p-4 flex flex-col gap-6 overflow-y-auto" data-testid="sidebar">
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Chart Profiles</h3>

        <div className="flex gap-2">
          <Input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder={selectedProfile?.name || 'Profile name'}
            data-testid="input-profile-name"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSaveProfile}
            aria-label="Save chart profile"
            data-testid="btn-save-profile"
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={activeProfileId ?? undefined} onValueChange={handleSelectProfile}>
            <SelectTrigger className="flex-1" data-testid="select-chart-profile">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={!activeProfileId}
            onClick={() => {
              if (activeProfileId) {
                deleteProfile(activeProfileId);
              }
            }}
            aria-label="Delete chart profile"
            data-testid="btn-delete-profile"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Indicators</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-rsi" className="cursor-pointer">Show RSI</Label>
            <Switch id="show-rsi" checked={showRsi} onCheckedChange={setShowRsi} data-testid="switch-show-rsi" />
          </div>

          {showRsi && (
            <div className="space-y-4 pl-4 border-l-2 border-border">
              <div className="space-y-2">
                <Label>RSI Period: {rsiPeriod}</Label>
                <Slider 
                  value={[rsiPeriod]} 
                  onValueChange={v => setRsiPeriod(v[0])} 
                  min={1} max={50} step={1} 
                  data-testid="slider-rsi-period"
                />
              </div>

              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={rsiSource} onValueChange={setRsiSource}>
                  <SelectTrigger data-testid="select-rsi-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="close">Close</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="hl2">HL2</SelectItem>
                    <SelectItem value="hlc3">HLC3</SelectItem>
                    <SelectItem value="ohlc4">OHLC4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>RSI Width: {rsiLineWidth}</Label>
                <Slider
                  value={[rsiLineWidth]}
                  onValueChange={(v) => setRsiLineWidth(v[0] as 1 | 2 | 3 | 4)}
                  min={1}
                  max={4}
                  step={1}
                  data-testid="slider-rsi-line-width"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Overbought</Label>
                  <Input 
                    type="number" 
                    value={obLevel} 
                    onChange={e => setObLevel(Number(e.target.value))}
                    data-testid="input-ob-level"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Oversold</Label>
                  <Input 
                    type="number" 
                    value={osLevel} 
                    onChange={e => setOsLevel(Number(e.target.value))}
                    data-testid="input-os-level"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <MaSection label="RSI SMA" id="show-rsi-sma" config={smaMa} onChange={setSmaMa} />
                <MaSection label="RSI EMA" id="show-rsi-ema" config={emaMa} onChange={setEmaMa} />
                <MaSection label="RSI WMA" id="show-rsi-wma" config={wmaMa} onChange={setWmaMa} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-rsi-bb" className="cursor-pointer">Bollinger Bands</Label>
                <Switch id="show-rsi-bb" checked={showRsiBb} onCheckedChange={setShowRsiBb} data-testid="switch-show-rsi-bb" />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-stoch-rsi" className="cursor-pointer">Stochastic RSI</Label>
                <Switch id="show-stoch-rsi" checked={showStochRsi} onCheckedChange={setShowStochRsi} data-testid="switch-show-stoch-rsi" />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-divergences" className="cursor-pointer">Divergences</Label>
                <Switch id="show-divergences" checked={showDivergences} onCheckedChange={setShowDivergences} data-testid="switch-show-divergences" />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-mtf" className="cursor-pointer">Multi-timeframe</Label>
                <Switch id="show-mtf" checked={showMtf} onCheckedChange={setShowMtf} data-testid="switch-show-mtf" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
