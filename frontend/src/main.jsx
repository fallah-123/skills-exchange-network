// Mounts the routed frontend and loads the global design system.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/refinement.css';

createRoot(document.getElementById('root')).render(<App />);
