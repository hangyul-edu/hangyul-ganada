import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Pretendard is the UI face identified in the design audit (OFL-1.1).
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/global.css';

import { App } from './App';
import { startNativeShell } from './native/shell';
import { registerServiceWorker } from './offline';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// After render, never before: the worker is an enhancement, and registering it
// on the critical path would delay the first thing the learner came for.
registerServiceWorker();

// Same reasoning, opposite urgency: this is what takes the launch screen down,
// so it has to be started as soon as there is a React tree to reveal. It does
// nothing at all in a browser.
startNativeShell();
