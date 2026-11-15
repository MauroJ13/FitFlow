// Minimal hash router used only by the smoke build (react-router-dom is not installed in the sandbox).
import { createContext, useContext, useEffect, useState, Children } from 'react';
const Ctx = createContext(null);
const ParamCtx = createContext({});
const read = () => ({ pathname: (location.hash.slice(1) || '/').split('?')[0], state: history.state?.usr ?? null });
export function HashRouter({ children }) {
  const [loc, setLoc] = useState(read);
  useEffect(() => { const f = () => setLoc(read()); addEventListener('hashchange', f); addEventListener('popstate', f); return () => { removeEventListener('hashchange', f); removeEventListener('popstate', f); }; }, []);
  const navigate = (to, opts = {}) => {
    if (typeof to === 'number') return history.go(to);
    history[opts.replace ? 'replaceState' : 'pushState']({ usr: opts.state ?? null }, '', '#' + to); setLoc(read());
  };
  return <Ctx.Provider value={{ loc, navigate }}>{children}</Ctx.Provider>;
}
const match = (pattern, path) => {
  if (pattern === '*') return {};
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) { if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) return null; }
  return params;
};
export function Routes({ children }) {
  const { loc } = useContext(Ctx);
  for (const c of Children.toArray(children)) { const p = match(c.props.path, loc.pathname); if (p) return <ParamCtx.Provider value={p}>{c.props.element}</ParamCtx.Provider>; }
  return null;
}
export const Route = () => null;
export function Navigate({ to, replace }) { const { navigate } = useContext(Ctx); useEffect(() => navigate(to, { replace }), []); return null; }
export const useNavigate = () => useContext(Ctx).navigate;
export const useLocation = () => useContext(Ctx).loc;
export const useParams = () => useContext(ParamCtx);
export function Link({ to, state, children, ...p }) { const { navigate } = useContext(Ctx); return <a href={'#' + to} {...p} onClick={(e) => { e.preventDefault(); navigate(to, { state }); }}>{children}</a>; }
export function NavLink({ to, end, className, children, ...p }) {
  const { loc, navigate } = useContext(Ctx);
  const isActive = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + '/');
  return <a href={'#' + to} {...p} className={typeof className === 'function' ? className({ isActive }) : className} onClick={(e) => { e.preventDefault(); navigate(to); }}>{children}</a>;
}
