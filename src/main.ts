import './styles.css';
import { startPwa } from './pwa/client';
import { App } from './ui/app';
import { bootTheme } from './ui/theme';

bootTheme(); // before the first render, so there's no flash of the default theme
new App(document.getElementById('app')!);
startPwa(() => document.getElementById('app')?.dataset.screen);
