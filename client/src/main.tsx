import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { ModuleRegistry as ChartsRegistry, AllCommunityModule as AllChartsModule } from 'ag-charts-community';
import App from './App';
import './index.css';

ModuleRegistry.registerModules([AllCommunityModule]);
ChartsRegistry.registerModules([AllChartsModule]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
