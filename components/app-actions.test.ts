import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppActions } from "./app-actions";

Object.assign(globalThis, { React });

describe("AppActions", () => {
  it("renders the three actions as buttons and no form until one is chosen", () => {
    const html = renderToStaticMarkup(
      createElement(AppActions, { slug: "alice-tour", hasDev: true, suspended: false })
    );
    expect(html).toContain(">revoke dev</button>");
    expect(html).toContain(">renew dev</button>");
    expect(html).toContain(">suspend</button>");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('disabled=""');
    // Every button is type=button: nothing submits before the confirm step.
    expect(html.match(/type="button"/g)?.length).toBe(3);
    expect(html).not.toContain('type="submit"');
  });

  it("disables revoke/renew without a dev release and suspend when already suspended", () => {
    const html = renderToStaticMarkup(
      createElement(AppActions, { slug: "bob-notes", hasDev: false, suspended: true })
    );
    expect(html.match(/disabled=""/g)?.length).toBe(3);
    expect(html).toContain('title="no dev release"');
    expect(html).toContain('title="already suspended"');
  });

  it("leaves suspend available for a draft-only app", () => {
    const html = renderToStaticMarkup(
      createElement(AppActions, { slug: "bob-notes", hasDev: false, suspended: false })
    );
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
});
