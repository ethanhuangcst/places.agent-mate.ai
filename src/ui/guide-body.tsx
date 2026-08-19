"use client";

import { AGENT_ID } from "../core/locales";
import {
  GUIDE_BASE_URL,
  GUIDE_BEARER_LINE,
  GUIDE_CHATBOX_HEADER,
  GUIDE_CURSOR_MCP_PATH,
  GUIDE_HEALTH_URL,
  GUIDE_CAPABILITIES,
  GUIDE_MCP_TOOLS,
  GUIDE_MCP_URL,
  GUIDE_SSE_URL,
  cursorMcpJsonSnippet,
  httpEndpointsBlock,
  httpSearchCurlExample,
} from "./guide-literals";
import { GuideCopyBlock } from "./guide-copy-block";
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
        <a
          href="#capabilities"
          data-i18n="admin.guide.toc_capabilities"
          data-testid="guide-toc-capabilities"
        >
          {tt("admin.guide.toc_capabilities")}
        </a>
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

      <section
        className="guide-section"
        id="capabilities"
        data-testid="guide-capabilities"
      >
        <h2 data-i18n="admin.guide.h_capabilities">{tt("admin.guide.h_capabilities")}</h2>
        <p data-i18n="admin.guide.cap_intro">{tt("admin.guide.cap_intro")}</p>
        <div className="table-wrap">
          <table className="guide-caps-table" data-testid="guide-capabilities-table">
            <thead>
              <tr>
                <th data-i18n="admin.guide.cap_col_capability">
                  {tt("admin.guide.cap_col_capability")}
                </th>
                <th data-i18n="admin.guide.cap_col_channel">
                  {tt("admin.guide.cap_col_channel")}
                </th>
                <th data-i18n="admin.guide.cap_col_body">{tt("admin.guide.cap_col_body")}</th>
              </tr>
            </thead>
            <tbody>
              {GUIDE_CAPABILITIES.map((cap) => {
                const channelKey =
                  cap.channel === "http"
                    ? "admin.guide.cap_channel_http"
                    : "admin.guide.cap_channel_both";
                return (
                  <tr key={cap.id}>
                    <td>
                      {cap.labelLiteral ? (
                        <code>{cap.label}</code>
                      ) : (
                        <span data-i18n={cap.titleKey}>{tt(cap.titleKey ?? cap.label)}</span>
                      )}
                    </td>
                    <td>
                      <div className="guide-cap-channel">
                        <span data-i18n={channelKey}>{tt(channelKey)}</span>
                        {cap.channelRoute ? <code>{cap.channelRoute}</code> : null}
                      </div>
                    </td>
                    <td data-i18n={cap.bodyKey}>{tt(cap.bodyKey)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="guide-section" id="architecture">
        <h2 data-i18n="admin.guide.h_architecture">{tt("admin.guide.h_architecture")}</h2>
        <h3 className="guide-sub" data-i18n="admin.guide.who">
          {tt("admin.guide.who")}
        </h3>
        <ul>
          <li data-i18n="admin.guide.who_apps">{tt("admin.guide.who_apps")}</li>
          <li data-i18n="admin.guide.who_mcp">{tt("admin.guide.who_mcp")}</li>
        </ul>
        <div className="guide-flow" aria-hidden="true">
          <div className="guide-flow-sources">
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
          <span className="guide-flow-join" />
          <span className="guide-flow-auth" data-i18n="admin.guide.flow_auth">
            {tt("admin.guide.flow_auth")}
          </span>
          <span className="guide-flow-rail" />
          <div className="guide-flow-hub">
            <p className="guide-flow-hub-name">{AGENT_ID}</p>
            <p className="guide-flow-hub-ops" data-i18n="admin.guide.flow_hub_ops">
              {tt("admin.guide.flow_hub_ops")}
            </p>
          </div>
          <span className="guide-flow-rail" />
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
        <GuideCopyBlock text={GUIDE_BEARER_LINE} testId="guide-copy-bearer" />
        <p className="field-note guide-note" data-i18n="admin.guide.key_note">
          {tt("admin.guide.key_note")}
        </p>
      </section>

      <section className="guide-section" id="http">
        <h2 data-i18n="admin.guide.h_http">{tt("admin.guide.h_http")}</h2>
        <p data-i18n="admin.guide.http_intro">{tt("admin.guide.http_intro")}</p>

        <h3 className="guide-sub" data-i18n="admin.guide.http_base_label">
          {tt("admin.guide.http_base_label")}
        </h3>
        <GuideCopyBlock text={GUIDE_BASE_URL} testId="guide-copy-http-base" />

        <h3 className="guide-sub" data-i18n="admin.guide.http_health_label">
          {tt("admin.guide.http_health_label")}
        </h3>
        <p data-i18n="admin.guide.http_health_body">{tt("admin.guide.http_health_body")}</p>
        <GuideCopyBlock text={GUIDE_HEALTH_URL} testId="guide-copy-health-url" />

        <h3 className="guide-sub" data-i18n="admin.guide.http_endpoints_label">
          {tt("admin.guide.http_endpoints_label")}
        </h3>
        <p data-i18n="admin.guide.http_endpoints_body">{tt("admin.guide.http_endpoints_body")}</p>
        <GuideCopyBlock
          text={httpEndpointsBlock()}
          multiline
          testId="guide-copy-http-endpoints"
        />

        <h3 className="guide-sub" data-i18n="admin.guide.http_auth_label">
          {tt("admin.guide.http_auth_label")}
        </h3>
        <GuideCopyBlock text={GUIDE_BEARER_LINE} testId="guide-copy-http-bearer" />

        <h3 className="guide-sub" data-i18n="admin.guide.http_envelope_label">
          {tt("admin.guide.http_envelope_label")}
        </h3>
        <p data-i18n="admin.guide.http_envelope_body">{tt("admin.guide.http_envelope_body")}</p>

        <h3 className="guide-sub" data-i18n="admin.guide.http_providers_label">
          {tt("admin.guide.http_providers_label")}
        </h3>
        <p data-i18n="admin.guide.http_providers_body">{tt("admin.guide.http_providers_body")}</p>

        <h3 className="guide-sub" data-i18n="admin.guide.http_curl_label">
          {tt("admin.guide.http_curl_label")}
        </h3>
        <GuideCopyBlock
          text={httpSearchCurlExample()}
          multiline
          testId="guide-copy-http-curl"
        />
      </section>

      <section className="guide-section" id="mcp">
        <h2 data-i18n="admin.guide.h_mcp">{tt("admin.guide.h_mcp")}</h2>
        <p data-i18n="admin.guide.mcp_intro">{tt("admin.guide.mcp_intro")}</p>

        <h3 className="guide-sub" data-i18n="admin.guide.mcp_cursor_label">
          {tt("admin.guide.mcp_cursor_label")}
        </h3>
        <p data-i18n="admin.guide.mcp_cursor_body">{tt("admin.guide.mcp_cursor_body")}</p>
        <GuideCopyBlock text={GUIDE_MCP_URL} testId="guide-copy-mcp-url" />

        <h3 className="guide-sub" data-i18n="admin.guide.mcp_cursor">
          {tt("admin.guide.mcp_cursor")}
        </h3>
        <p data-i18n="admin.guide.mcp_cursor_file_body">{tt("admin.guide.mcp_cursor_file_body")}</p>
        <GuideCopyBlock text={GUIDE_CURSOR_MCP_PATH} testId="guide-copy-cursor-mcp-path" />
        <GuideCopyBlock
          text={cursorMcpJsonSnippet()}
          multiline
          testId="guide-copy-mcp-json"
        />
        <p className="field-note guide-note" data-i18n="admin.guide.mcp_cursor_env_note">
          {tt("admin.guide.mcp_cursor_env_note")}
        </p>

        <h3 className="guide-sub" data-i18n="admin.guide.mcp_chatbox_label">
          {tt("admin.guide.mcp_chatbox_label")}
        </h3>
        <p data-i18n="admin.guide.mcp_chatbox_body">{tt("admin.guide.mcp_chatbox_body")}</p>
        <GuideCopyBlock text={GUIDE_SSE_URL} testId="guide-copy-sse-url" />

        <h3 className="guide-sub" data-i18n="admin.guide.mcp_chatbox_header_label">
          {tt("admin.guide.mcp_chatbox_header_label")}
        </h3>
        <GuideCopyBlock text={GUIDE_CHATBOX_HEADER} testId="guide-copy-chatbox-header" />

        <h3 className="guide-sub" data-i18n="admin.guide.mcp_tools_label">
          {tt("admin.guide.mcp_tools_label")}
        </h3>
        <p data-i18n="admin.guide.mcp_tools_body">{tt("admin.guide.mcp_tools_body")}</p>
        <ul className="guide-tool-list">
          {GUIDE_MCP_TOOLS.map((tool) => (
            <li key={tool}>
              <code>{tool}</code>
            </li>
          ))}
        </ul>

        <p className="guide-note" data-i18n="admin.guide.mcp_parity">
          {tt("admin.guide.mcp_parity")}
        </p>
      </section>
    </>
  );
}
