import { CheckCircle2 } from 'lucide-react';
import Logo from './Logo.jsx';

const POINTS = [
  'Upload your admission documents and see their status at any time',
  'Know exactly which documents are still missing',
  'Get notified as soon as the admission office reviews a document',
];

/**
 * Login / register frame: navy brand panel beside the form. The page itself never scrolls; on very
 * short screens only the form panel does. On narrow screens the panel is hidden and the logo moves
 * above the form.
 */
export default function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="auth-brand">
          <Logo size={56} decorative />
          <span className="brand-text">
            <span className="brand-name">ADVS</span>
            <span className="brand-sub">Admission Document Verification System</span>
          </span>
        </div>
        <div>
          <h2>Admission documents, verified in one place.</h2>
          <ul>
            {POINTS.map((point) => (
              <li key={point}>
                <CheckCircle2 size={18} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <footer>CS314 prototype · Team T009 · LNMIIT Jaipur</footer>
      </aside>
      <main className="auth-main">
        <div className="auth-main-inner">
          <Logo size={56} className="auth-mobile-logo" />
          {children}
        </div>
      </main>
    </div>
  );
}
