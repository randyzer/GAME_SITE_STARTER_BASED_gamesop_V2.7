import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(new URL("../src/components/navigation/MobileNav.astro", import.meta.url), "utf8")
  .match(/<script is:inline>([^]*?)<\/script>/)?.[1];

// Narrow event/element stubs exercise the shipped controller, not browser/CSS semantics.
// Native toggle timing, visibility and keyboard paths remain A4 real-browser obligations.
class ElementStub {
  children: ElementStub[] = [];
  parentElement?: ElementStub;
  attributes: Record<string, string> = {};
  listeners: Record<string, (event: unknown) => void> = {};
  href = "";
  constructor(readonly tag: string, readonly classes: string[], readonly activate: (element: ElementStub) => void) {}
  append<T extends ElementStub>(child: T): T { child.parentElement = this; this.children.push(child); return child; }
  contains(element: unknown): boolean { return this === element || this.children.some((child) => child.contains(element)); }
  matches(selector: string): boolean {
    if (selector.startsWith(".")) return this.classes.includes(selector.slice(1));
    if (selector === "details[open]") return this instanceof DetailsStub && this.open;
    if (selector === "[data-nav-page-id]") return this.hasAttribute("data-nav-page-id");
    if (selector === "a[href]") return this.tag === "a" && Boolean(this.href);
    return this.tag === selector;
  }
  closest(selector: string): ElementStub | undefined { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  querySelectorAll(selector: string): ElementStub[] {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return selector === ":scope > summary"
    ? this.children.find((child) => child.tag === "summary") : this.querySelectorAll(selector)[0]; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return name in this.attributes; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  addEventListener(name: string, listener: (event: unknown) => void) { this.listeners[name] = listener; }
  getClientRects() { return [{}]; }
  focus() { this.activate(this); }
}
class DetailsStub extends ElementStub { open = false; }

function fixture(withDesktop = true) {
  let active: ElementStub;
  const activate = (element: ElementStub) => { active = element; };
  const element = (tag: string, ...classes: string[]) => new ElementStub(tag, classes, activate);
  const body = element("body"); active = body;
  const header = body.append(element("header", "site-header"));
  const home = header.append(element("a", "brand")); home.href = "/";
  const desktop = header.append(element("nav", ...(withDesktop ? ["desktop-nav"] : [])));
  const desktopGroup = desktop.append(element("li", "desktop-nav__group"));
  desktopGroup.attributes["data-nav-page-id"] = "hub.guides";
  const desktopParent = desktopGroup.append(element("a", "desktop-nav__link")); desktopParent.href = "/guides/";
  const desktopChild = desktopGroup.append(element("a")); desktopChild.href = "/guides/item/";
  desktopChild.attributes["data-nav-page-id"] = "guide.item";
  const mobile = header.append(new DetailsStub("details", ["mobile-nav"], activate));
  const summary = mobile.append(element("summary"));
  const group = mobile.append(new DetailsStub("details", ["mobile-nav__group"], activate));
  const groupSummary = group.append(element("summary"));
  const overview = group.append(element("a", "mobile-nav__overview")); overview.href = "/guides/";
  overview.attributes["data-nav-page-id"] = "hub.guides";
  const child = group.append(element("a")); child.href = "/guides/item/";
  child.attributes["data-nav-page-id"] = "guide.item";
  const main = body.append(element("main"));
  const mode = { matches: true, change: () => {}, addEventListener: (_name: string, listener: () => void) => { mode.change = listener; } };
  runInNewContext(script ?? "", {
    Element: ElementStub, HTMLElement: ElementStub, HTMLDetailsElement: DetailsStub, URL,
    document: { querySelector: (selector: string) => body.querySelector(selector), get activeElement() { return active; },
      getElementById: (id: string) => id === "main-content" ? main : null },
    window: { location: { href: "https://field-notes.example/" }, matchMedia: () => mode },
    getComputedStyle: () => ({ visibility: "visible" }),
  });
  const send = (name: string, target: ElementStub, key?: string) => {
    const event = { target, key, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    mobile.listeners[name]?.(event); return event;
  };
  return { mobile, group, summary, groupSummary, child, main, home, desktopParent, desktopChild, mode, send,
    get active() { return active; }, open: () => { mobile.open = true; group.open = true; } };
}

describe("AX-01 local progressive enhancement", () => {
  it("executes the actual inline controller", () => { expect(script).toBeTruthy(); });

  it("closes innermost disclosure first and restores each corresponding trigger", () => {
    const view = fixture(); view.open(); view.child.focus();
    expect(view.send("keydown", view.child, "Escape").preventDefault).toHaveBeenCalledOnce();
    expect(view.group.open).toBe(false); expect(view.mobile.open).toBe(true);
    expect(view.active).toBe(view.groupSummary);
    view.send("keydown", view.groupSummary, "Escape");
    expect(view.mobile.open).toBe(false); expect(view.active).toBe(view.summary);
  });

  it("does not consume native activation or unrelated Escape", () => {
    const view = fixture();
    for (const key of ["Enter", " ", "Escape"]) {
      expect(view.send("keydown", view.summary, key).preventDefault).not.toHaveBeenCalled();
    }
    view.open();
    expect(view.send("keydown", view.main, "Escape").preventDefault).not.toHaveBeenCalled();
    expect(view.mobile.open).toBe(true);
  });

  it("cleans descendants on ancestor close without leaving hidden focus", () => {
    const view = fixture(); view.open(); view.child.focus(); view.mobile.open = false;
    view.send("toggle", view.mobile);
    expect(view.group.open).toBe(false); expect(view.active).toBe(view.summary);
    view.send("toggle", view.group);
    expect(view.active).toBe(view.summary);
    view.open(); view.main.focus(); view.mobile.open = false; view.send("toggle", view.mobile);
    expect(view.active).toBe(view.main);
  });

  it("closes before ordinary navigation without suppressing its default action", () => {
    const view = fixture(); view.open(); view.child.focus();
    const event = view.send("click", view.child);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(view.mobile.open).toBe(false); expect(view.group.open).toBe(false); expect(view.active).toBe(view.summary);
  });

  it("moves same-document navigation focus to its target and preserves existing tabindex", () => {
    const view = fixture(); view.open(); view.child.href = "/#main-content";
    view.send("click", view.child);
    expect(view.active).toBe(view.main); expect(view.main.getAttribute("tabindex")).toBe("-1");
    view.main.listeners.blur?.({}); expect(view.main.hasAttribute("tabindex")).toBe(false);
    view.main.setAttribute("tabindex", "0"); view.open(); view.send("click", view.child);
    expect(view.main.getAttribute("tabindex")).toBe("0");
  });

  it("maps hidden mobile child/group focus to desktop and reverses to the mobile trigger", () => {
    const view = fixture(); view.open(); view.child.focus(); view.mode.matches = false; view.mode.change();
    expect(view.active).toBe(view.desktopChild); expect(view.mobile.open).toBe(false); expect(view.group.open).toBe(false);
    view.mode.matches = true; view.mode.change(); expect(view.active).toBe(view.summary);
    view.open(); view.groupSummary.focus(); view.mode.matches = false; view.mode.change();
    expect(view.active).toBe(view.desktopParent);
    view.main.focus(); view.mode.matches = true; view.mode.change(); expect(view.active).toBe(view.main);
  });

  it("falls back to visible home and leaves incomplete setup entirely native", () => {
    const view = fixture(); view.open(); view.summary.focus(); view.mode.matches = false; view.mode.change();
    expect(view.active).toBe(view.home);
    const native = fixture(false); native.open();
    expect(native.mobile.listeners).toEqual({}); expect(native.mobile.open).toBe(true);
  });
});
