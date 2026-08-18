"use client";

import { AGENT_ID } from "../core/locales";
import { GUIDE_BEARER_LINE, mcpSnippet } from "./guide-literals";
import { useT } from "./locale";

export function GuideBody() {
  const tt = useT();
  return (
    <>
      <p className="eyebrow" data-i18n="admin.guide.eyebrow">
        {tt("admin.guide.eyebrow")}
      </p>
      <h1 data-i18n="admin.guide.title">{tt("admin.guide.title")}</h1>
      <p className="lead" data-i18n="admin.guide.lead">
        {tt("admin.guide.lead")}
      </p>
      <nav className="guide-toc">
        <a href="#architecture" data-i18n="admin.guide.toc_architecture">
          {tt("admin.guide.toc_architecture")}
        </a>
        <a href="#key" data-i18n="admin.guide.toc_key">
          {tt("admin.guide.toc_key")}
        </a>
        <a href="#http" data-i18n="admin.guide.toc_http">
          {tt("admin.guide.toc_http")}
        </a>
        <a href="#mcp" data-i18n="admin.guide.toc_mcp">
          {tt("admin.guide.toc_mcp")}
        </a>
      </nav>

      <section className="guide-section" id="architecture">
        <h2 data-i18n="admin.guide.h_architecture">{tt("admin.guide.h_architecture")}</h2>
        <h3 className="guide-sub" data-i18n="admin.guide.who">
          {tt("admin.guide.who")}
        </h3>
        <ul>
          <li data-i18n="admin.guide.who_apps">{tt("admin.guide.who_apps")}</li>
          <li data-i18n="admin.guide.who_mcp">{tt("admin.guide.who_mcp")}</li>
        </ul>
        <h3 className="guide-sub" data-i18n="admin.guide.provides">
          {tt("admin.guide.provides")}
        </h3>
        <ul>
          <li>
            <code>search_restaurants</code>, <code>search_places</code>,{" "}
            <code>get_place_details</code>, <code>navigate</code>
          </li>
          <li>
            <code>plan_itinerary</code>
          </li>
          <li data-i18n="admin.guide.provides_3">{tt("admin.guide.provides_3")}</li>
        </ul>
        <div className="guide-flow" aria-hidden="true">
          <div className="guide-flow-lanes">
            <div className="guide-flow-lane">
              <p className="guide-flow-clients" data-i18n="admin.guide.flow_http_who">
                {tt("admin.guide.flow_http_who")}
              </p>
              <span className="guide-flow-proto" data-i18n="admin.guide.flow_http">
                {tt("admin.guide.flow_http")}
              </span>
            </div>
            <div className="guide-flow-lane">
              <p className="guide-flow-clients" data-i18n="admin.guide.flow_mcp_who">
                {tt("admin.guide.flow_mcp_who")}
              </p>
              <span className="guide-flow-proto" data-i18n="admin.guide.flow_mcp">
                {tt("admin.guide.flow_mcp")}
              </span>
            </div>
          </div>
          <div className="guide-flow-merge">
            <span className="guide-flow-auth" data-i18n="admin.guide.flow_auth">
              {tt("admin.guide.flow_auth")}
            </span>
          </div>
          <div className="guide-flow-hub">
            <p className="guide-flow-hub-name">{AGENT_ID}</p>
            <p className="guide-flow-hub-ops" data-i18n="admin.guide.flow_hub_ops">
              {tt("admin.guide.flow_hub_ops")}
            </p>
          </div>
          <div className="guide-flow-store">
            <p data-i18n="admin.guide.flow_vendors">{tt("admin.guide.flow_vendors")}</p>
            <p className="guide-flow-store-meta" data-i18n="admin.guide.flow_vendors_meta">
              {tt("admin.guide.flow_vendors_meta")}
            </p>
          </div>
        </div>
        <p data-i18n="admin.guide.id_note">{tt("admin.guide.id_note")}</p>
      </section>

      <section className="guide-section" id="key">
        <h2 data-i18n="admin.guide.h_key">{tt("admin.guide.h_key")}</h2>
        <p data-i18n="admin.guide.key_body">{tt("admin.guide.key_body")}</p>
        <div className="code-block">
          <pre>
            <code>{GUIDE_BEARER_LINE}</code>
          </pre>
        </div>
        <p className="field-note" style={{ marginTop: "1rem" }} data-i18n="admin.guide.key_note">
          {tt("admin.guide.key_note")}
        </p>
      </section>

      <section className="guide-section" id="http">
        <h2 data-i18n="admin.guide.h_http">{tt("admin.guide.h_http")}</h2>
        <p data-i18n="admin.guide.http_body">{tt("admin.guide.http_body")}</p>
      </section>

      <section className="guide-section" id="mcp">
        <h2 data-i18n="admin.guide.h_mcp">{tt("admin.guide.h_mcp")}</h2>
        <p data-i18n="admin.guide.mcp_body">{tt("admin.guide.mcp_body")}</p>
        <h3 className="guide-sub" data-i18n="admin.guide.mcp_cursor">
          {tt("admin.guide.mcp_cursor")}
        </h3>
        <div className="code-block">
          <pre>
            <code>{mcpSnippet()}</code>
          </pre>
        </div>
        <p style={{ marginTop: "1.25rem" }} data-i18n="admin.guide.mcp_chatbox">
          {tt("admin.guide.mcp_chatbox")}
        </p>
      </section>
    </>
  );
}
