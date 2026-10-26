import { ChevronRight } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { ROLE_HOME } from '../context/AuthContext.jsx';
import { PAGES } from '../navigation.js';

function findPage(pathname) {
  for (const page of PAGES) {
    const match = matchPath({ path: page.pattern, end: true }, pathname);
    if (match) return { page, match };
  }
  return null;
}

/** Home › parent › current page, built from the PAGES table. */
export default function Breadcrumbs({ role }) {
  const { pathname } = useLocation();
  const found = findPage(pathname);
  const titleOf = (page) => (typeof page.title === 'function' ? page.title(role) : page.title);

  const trail = [];
  if (found) {
    trail.unshift({ title: titleOf(found.page), to: pathname });
    let parentPattern = found.page.parent;
    while (parentPattern) {
      const parent = PAGES.find((p) => p.pattern === parentPattern);
      if (!parent) break;
      trail.unshift({ title: titleOf(parent), to: parent.pattern });
      parentPattern = parent.parent;
    }
  }
  const home = ROLE_HOME[role];
  if (trail[0]?.to !== home) trail.unshift({ title: 'Home', to: home });

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, i) => (
          <li key={crumb.to}>
            {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
            {i === trail.length - 1 ? (
              <span aria-current="page">{crumb.title}</span>
            ) : (
              <Link to={crumb.to}>{crumb.title}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
