import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../widget/styles.css';
import { StaffApp } from './StaffApp';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StaffApp />
    </StrictMode>,
  );
}
