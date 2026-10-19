import { useApp } from '@/app/store';
import { TokenBadge } from '@/components/TokenBadge';
import { HomeScreen } from '@/screens/HomeScreen';
import { WizardScreen } from '@/screens/WizardScreen';
import { CookingScreen } from '@/screens/CookingScreen';
import { EditorScreen } from '@/screens/EditorScreen';

export function App() {
  const screen = useApp((s) => s.screen);

  return (
    <div className="app">
      <TokenBadge />
      {screen === 'home' && <HomeScreen />}
      {screen === 'wizard' && <WizardScreen />}
      {screen === 'cooking' && <CookingScreen />}
      {screen === 'editor' && <EditorScreen />}
    </div>
  );
}
