import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroupTabs } from "./group-tabs";

Object.assign(globalThis, { React });

describe("GroupTabs", () => {
  it("renders the §3.3 tabs as GET links on ?group=, user as the bare page", () => {
    const html = renderToStaticMarkup(createElement(GroupTabs, { group: "stage" }));
    expect(html).toContain('href="/tokens"');
    for (const group of ["model", "provider", "tier", "lane", "stage", "project"]) {
      expect(html).toContain(`href="/tokens?group=${group}"`);
    }
    expect(html).not.toContain("family");
    expect(html.match(/<a /g)?.length).toBe(7);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });

  it("marks only the active tab", () => {
    const html = renderToStaticMarkup(createElement(GroupTabs, { group: "lane" }));
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html).toMatch(/<a aria-current="page" class="[^"]*border-foreground text-foreground" href="\/tokens\?group=lane">lane<\/a>/);
    expect(html.match(/border-foreground/g)?.length).toBe(1);
  });

  it("marks nothing when the group is valid but not a tab, and honours a base path", () => {
    const html = renderToStaticMarkup(
      createElement(GroupTabs, { group: "family", basePath: "/spend" })
    );
    expect(html).not.toContain("aria-current");
    expect(html).toContain('href="/spend"');
    expect(html).toContain('href="/spend?group=model"');
  });
});
