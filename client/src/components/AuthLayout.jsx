import { CheckCircle2 } from 'lucide-react';

const POINTS = [
  'Upload your admission documents and see their status at any time',
  'Know exactly which documents are still missing',
  'Get notified as soon as the admission office reviews a document',
];

/** Login / register frame: navy brand panel beside the form (panel hidden on small screens). */
export default function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="sidebar-brand">
          <span className="brand-mark">ADVS</span>
          <span className="brand-text">
            <span className="brand-name">ADVS</span>
            <span className="brand-sub">Admission Document Verification</span>
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
      <main className="auth-main">{children}</main>
    </div>
  );
}
