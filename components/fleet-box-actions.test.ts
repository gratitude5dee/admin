import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FleetBoxActions } from "./fleet-box-actions";

Object.assign(globalThis, { React });

describe("FleetBoxActions", () => {
  it("defaults safe-stop to dev and requires an explicit confirmation", () => {
    const html = renderToStaticMarkup(createElement(FleetBoxActions, {}));
    expect(html).toContain('value="dev" selected=""');
    expect(html).toContain('type="checkbox" required="" name="confirm"');
    expect(html).toContain("Apply username labels");
    expect(html).toContain("Stable box IDs remain unchanged");
  });

  it("keeps continuation on its original channel and escapes report text", () => {
    const html = renderToStaticMarkup(createElement(FleetBoxActions, {
      continuation: "prod", after: "tk_abc", result: "<script>bad()</script>",
    }));
    expect(html).toContain('name="channel" value="prod"');
    expect(html).toContain('name="after" value="tk_abc"');
    expect(html).toContain("Continue safe-stop batch");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<script>");
  });
});
