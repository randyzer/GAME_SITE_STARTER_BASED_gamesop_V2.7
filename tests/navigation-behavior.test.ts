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
  hidden = false;
  get isConnected(): boolean { return this.tag === "body" || Boolean(this.parentElement?.isConnected); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = undefined;
  }
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
  getClientRects(): object[] {
    if (!this.isConnected || this.hidden || this.parentElement?.getClientRects().length === 0) return [];
    if (this.parentElement instanceof DetailsStub && !this.parentElement.open && this.tag !== "summary") return [];
    return [{}];
  }
  focus() { this.activate(this); }
}
class DetailsStub extends ElementStub { open = false; }

function fixture(withDesktop = true, initialMobile = true) {
  const documentListeners: Record<string, (event: unknown) => void> = {};
  const microtasks: Array<() => void> = [];
  let active: ElementStub;
  const activate = (element: ElementStub) => {
    if (active === element) return;
    documentListeners.focusout?.({ target: active, relatedTarget: element });
    active = element;
    documentListeners.focusin?.({ target: element });
  };
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
  let matches = initialMobile;
  const mode = {
    get matches() { return matches; },
    set matches(value: boolean) { matches = value; mobile.hidden = !value; desktop.hidden = value; },
    change: () => {},
    addEventListener: (_name: string, listener: () => void) => { mode.change = listener; },
  };
  mode.matches = initialMobile;
  runInNewContext(script ?? "", {
    Element: ElementStub, HTMLElement: ElementStub, HTMLDetailsElement: DetailsStub, URL,
    document: { body, documentElement: body,
      addEventListener: (name: string, listener: (event: unknown) => void) => { documentListeners[name] = listener; },
      querySelector: (selector: string) => body.querySelector(selector), get activeElement() { return active; },
      getElementById: (id: string) => id === "main-content" ? main : null },
    window: { location: { href: "https://field-notes.example/" }, matchMedia: () => mode },
    queueMicrotask: (callback: () => void) => { microtasks.push(callback); },
    getComputedStyle: (element: ElementStub) => ({ visibility: element.hidden ? "hidden" : "visible",
      display: element.getClientRects().length ? "block" : "none" }),
  });
  const send = (name: string, target: ElementStub, key?: string) => {
    const event = { target, key, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    mobile.listeners[name]?.(event); return event;
  };
  return { body, mobile, group, summary, groupSummary, child, main, home, desktopParent, desktopChild, mode, send,
    browserBodyLoss: () => {
      documentListeners.focusout?.({ target: active, relatedTarget: null });
      active = body; // The recorded browser loss has no subsequent focusin to a user-chosen target.
    },
    flushMicrotasks: () => { while (microtasks.length) microtasks.shift()?.(); },
    pointerOutside: () => { documentListeners.pointerdown?.({ target: main }); },
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

  it("suppresses only exact current-URL reload so visible focus survives", () => {
    const view = fixture(); view.open(); view.child.href = "/";
    const event = view.send("click", view.child);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(view.mobile.open).toBe(false); expect(view.group.open).toBe(false);
    expect(view.active).toBe(view.home);
    view.open(); view.child.href = "/#main-content";
    expect(view.send("click", view.child).preventDefault).not.toHaveBeenCalled();
    expect(view.active).toBe(view.main);
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


describe("breakpoint focus migration intent", () => {
  it("recovers mobile page identity after browser BODY loss precedes MQL", () => {
    const view = fixture(); view.open(); view.child.focus(); view.mode.matches = false;
    view.browserBodyLoss(); view.flushMicrotasks(); view.mode.change();
    expect(view.active).toBe(view.desktopChild);
  });
  it("recovers reverse identity after browser BODY loss precedes MQL", () => {
    const view = fixture(true, false); view.desktopChild.focus(); view.mode.matches = true;
    view.browserBodyLoss(); view.flushMicrotasks(); view.mode.change();
    expect(view.active).toBe(view.summary);
  });
  it("does not steal outside focus on either crossing direction", () => {
    for (const initialMobile of [true, false]) {
      const view = fixture(true, initialMobile); view.open();
      (initialMobile ? view.child : view.desktopChild).focus(); view.home.focus();
      view.mode.matches = !initialMobile; view.mode.change(); expect(view.active).toBe(view.home);
    }
  });
  it("revokes same-mode BODY loss before a later crossing", () => {
    const view = fixture(); view.open(); view.child.focus(); view.browserBodyLoss(); view.flushMicrotasks();
    view.mode.matches = false; view.mode.change(); expect(view.active).toBe(view.body);
  });
  it("bounds missing-target fallback to visible connected home", () => {
    const view = fixture(); view.open(); view.child.focus(); view.desktopChild.remove();
    view.mode.matches = false; view.browserBodyLoss(); view.mode.change(); expect(view.active).toBe(view.home);
  });
  it("leaves browser focus unchanged when missing target and home are unavailable", () => {
    const view = fixture(); view.open(); view.child.focus(); view.desktopChild.remove(); view.home.hidden = true;
    view.mode.matches = false; view.browserBodyLoss();
    expect(() => view.mode.change()).not.toThrow(); expect(view.active).toBe(view.body);
  });
  it("uses the updated group and outer-trigger identities after Escape", () => {
    const group = fixture(); group.open(); group.child.focus(); group.send("keydown", group.child, "Escape");
    group.mode.matches = false; group.browserBodyLoss(); group.mode.change(); expect(group.active).toBe(group.desktopParent);
    const outer = fixture(); outer.open(); outer.child.focus(); outer.send("keydown", outer.child, "Escape");
    outer.send("keydown", outer.groupSummary, "Escape"); outer.mode.matches = false;
    outer.browserBodyLoss(); outer.mode.change(); expect(outer.active).toBe(outer.home);
  });
  it("uses Menu identity after native ancestor close", () => {
    const view = fixture(); view.open(); view.child.focus(); view.mobile.open = false; view.send("toggle", view.mobile);
    expect(view.active).toBe(view.summary); view.mode.matches = false; view.browserBodyLoss(); view.mode.change();
    expect(view.active).toBe(view.home);
  });
  it("does not reuse a removed outgoing semantic source", () => {
    const view = fixture(); view.open(); view.child.focus(); view.child.remove(); view.mode.matches = false;
    view.browserBodyLoss(); view.mode.change(); expect(view.active).toBe(view.body);
  });
  it("does not migrate or close disclosures for unchanged media mode", () => {
    const view = fixture(); view.open(); view.child.focus(); view.mode.change();
    expect(view.active).toBe(view.child); expect(view.mobile.open).toBe(true); expect(view.group.open).toBe(true);
  });
  it("respects outside pointer intent even if the old nav still has live focus", () => {
    const view = fixture(); view.open(); view.child.focus(); view.pointerOutside(); view.mode.matches = false;
    view.mode.change(); expect(view.active).toBe(view.child); // The controller performs no focus call.
  });
  it("does not let an old microtask erase the newly migrated identity", () => {
    const view = fixture(); view.open(); view.child.focus(); view.mode.matches = false;
    view.browserBodyLoss(); view.mode.change(); view.flushMicrotasks(); expect(view.active).toBe(view.desktopChild);
    view.mode.matches = true; view.browserBodyLoss(); view.flushMicrotasks(); view.mode.change();
    expect(view.active).toBe(view.summary);
  });
});
