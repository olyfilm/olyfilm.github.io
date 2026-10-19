import { useApp } from '@/app/store';
import { TokenBadge } from '@/components/TokenBadge';
import { SettingsButton } from '@/components/Settings';
import { HomeScreen } from '@/screens/HomeScreen';
import { WizardScreen } from '@/screens/WizardScreen';
import { CookingScreen } from '@/screens/CookingScreen';
import { EditorScreen } from '@/screens/EditorScreen';

export function App() {
  const screen = useApp((s) => s.screen);

  return (
    <div className="app">
      <div className="topbar">
        <SettingsButton />
        <TokenBadge />
      </div>
      {screen === 'home' && <HomeScreen />}
      {screen === 'wizard' && <WizardScreen />}
      {screen === 'cooking' && <CookingScreen />}
      {screen === 'editor' && <EditorScreen />}
    </div>
  );
}
