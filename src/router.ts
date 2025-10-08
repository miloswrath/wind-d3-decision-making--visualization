export type PageCtx = {
  params: Record<string, string>;
  query: URLSearchParams;
  navigate: (path: string) => void;
};

export type Page = (root: HTMLElement, ctx: PageCtx) => void | Promise<void>;


function normPath(s: string) {
  // strip query/hash, collapse trailing slashes, map "" to "/"
  s = s.split("#")[0].split("?")[0];
  s = s.replace(/index\.html$/i, "").replace(/\/+$/,"");
  return s || "/";
}


export type Route = {
  path: string;          // supports /, /about, /item/:id
  title?: string;
  render: Page;
};

function compile(path: string) {
  const keys: string[] = [];
  path = normPath(path);                // <— ensure "/" stays "/"
  const pattern = path.replace(/:[^/]+/g, m => {
    keys.push(m.slice(1));
    return "([^/]+)";
  });
  const re = new RegExp(`^${pattern}$`); // <— no empty fallback
  return { re, keys };
}

export class Router {
  private routes: { cfg: Route; re: RegExp; keys: string[] }[] = [];
  private outlet: HTMLElement;
  private base = (document.querySelector("base")?.getAttribute("href") || "/")
                  .replace(/\/+$/,"");  // e.g., "/repo"

  constructor(opts: { routes: Route[]; outlet: HTMLElement }) {
    this.outlet = opts.outlet;
    this.routes = opts.routes.map(cfg => ({ cfg, ...compile(cfg.path) }));
    window.addEventListener("popstate", () => this.handle(new URL(location.href)));
    document.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a[data-link]") as HTMLAnchorElement | null;
      if (a && a.origin === location.origin) {
        e.preventDefault();
        this.navigate(a.pathname);
      }
    });
    this.handle(new URL(location.href));
  }
  navigate = (path: string) => {
    const url = new URL(path, location.origin);
    const target = `${url.pathname}${url.search}${url.hash}`;
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (target === current) return;
    history.pushState({}, "", target);
    this.handle(url);
  };

  private async handle(input: string | URL) {
    const url = input instanceof URL ? input : new URL(input, location.origin);
    const path = url.pathname.replace(/\/+$/,"") || "/";
    for (const r of this.routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])] ));
      document.title = r.cfg.title ?? "Decision Layout";
      this.outlet.replaceChildren(); // clear
      await r.cfg.render(this.outlet, {
        params,
        query: new URLSearchParams(url.searchParams),
        navigate: this.navigate,
      });
      window.scrollTo({ top: 0 });
      return;
    }
    // 404
    this.outlet.innerHTML = `<div class="card"><h1 class="h1">Not Found</h1><p>No route for <code>${path}</code></p></div>`;
  }
}
