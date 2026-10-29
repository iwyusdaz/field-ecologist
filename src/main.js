/**
 * Entry point: dialog scaffolding + the App controller (engine + scene +
 * modules live in app.js; the WebGL fallback is injected there once the shell
 * exists).
 * @module main
 */
import './styles/case-fonts.css';
import './v2/hud-shell.css';
import './styles/case-hud.css';
import { App, SLUG } from './app.js';

window.__SLUG__ = SLUG;

function main() {
  document.body.insertAdjacentHTML('afterbegin',
    '<dialog id="settings-dialog" aria-labelledby="settings-h"></dialog>' +
    '<dialog id="progress-dialog" aria-labelledby="progress-h"></dialog>' +
    '<dialog id="guide-dialog" aria-labelledby="guide-dialog-title"></dialog>');

  const app = new App();
  app.ready.catch((e) => {
    console.error('app failed to start:', e);
    document.getElementById('overlays')?.insertAdjacentHTML(
      'beforeend',
      '<div role="alert"><p>The experience failed to start. Please reload the page.</p></div>',
    );
  });
}

main();
