import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/themes/deep-focus.css';
import './styles/themes/arcade-neon.css';
import './styles/themes/zen-light.css';
import './styles/themes/night-owl.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
