import './styles.css';
import { startPwa } from './pwa/client';
import { App } from './ui/app';
import { loadSettings } from './core/storage';
import { bootTheme } from './ui/theme';
import { initWorld } from './ui/world/world';
import './ui/world/world.css';

bootTheme(); // before the first render, so there's no flash of the default theme
let calm = false;
try {
  calm = !!loadSettings(localStorage).calm;
} catch {
  // storage blocked: Calm mode still follows the OS reduced-motion setting
}
initWorld(calm);
new App(document.getElementById('app')!);
startPwa(() => document.getElementById('app')?.dataset.screen);
