import './styles.css';
import { startPwa } from './pwa/client';
import { App } from './ui/app';

new App(document.getElementById('app')!);
startPwa(() => document.getElementById('app')?.dataset.screen);
