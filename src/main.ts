
import { Router, type Route } from "./router";
import Home from "./pages/Home";
import LayoutBuilder from "./pages/LayoutBuilder";
import About from "./pages/About";

const routes: Route[] = [
  { path: "/",        title: "Home • Decision Layout",    render: Home },
  { path: "",         title: "Home • Decision Layout",    render: Home },
  { path: "/builder", title: "Builder • Decision Layout", render: LayoutBuilder },
  { path: "/about",   title: "About • Decision Layout",   render: About }
];

new Router({
  routes,
  outlet: document.getElementById("app")!
});
