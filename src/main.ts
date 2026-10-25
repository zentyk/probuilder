import './style.css';
import { Editor } from './core/Editor';
import { UIManager } from './ui/UIManager';

window.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.querySelector<HTMLDivElement>('#app')!;

  // 1. Initialize UIManager, which renders the application layout (including #pb-viewport-container)
  const uiManager = new UIManager(appContainer);

  // 2. Query the rendered 3D viewport container
  const viewportContainer = document.querySelector<HTMLElement>('#pb-viewport-container')!;

  // 3. Initialize the 3D Editor inside the viewport
  const editor = new Editor(viewportContainer);

  // 4. Bind the Editor to the UI Manager to connect events and sync state
  uiManager.bindEditor(editor);

  console.log(
    '%c Voskel 3D Level Editor %c Ready for level prototyping! ',
    'background: #f97316; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
    'background: #1e2029; color: #38bdf8; padding: 4px 8px; border-radius: 0 4px 4px 0;'
  );
});
