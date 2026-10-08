// Shared wording for blocklists.
import type { Blocklist } from "./types";

/** "App, youtube.com, and alternative viewers" style summaries. */
export function summary(list: Blocklist): string {
  if (list.apps.some((a) => a.on && a.package === "category:game")) return "Every game on this device";
  // Alternative viewer apps read as "alternative viewers", alongside maintained site lists.
  const apps = list.apps.filter((a) => a.on && a.note !== "Alternative viewer");
  const viewers = list.apps.some((a) => a.on && a.note === "Alternative viewer");
  const sites = list.sites.filter((s) => s.on && !s.site.startsWith("list:"));
  const parts: string[] = [];
  if (apps.length === 1) parts.push("App");
  else if (apps.length > 1) parts.push(`${apps.length} apps`);
  if (sites.length) parts.push(sites[0].site + (sites.length > 1 ? ` +${sites.length - 1}` : ""));
  if (viewers || list.sites.some((s) => s.on && s.site.startsWith("list:"))) parts.push("alternative viewers");
  if (!parts.length) return "Nothing blocked";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} and ${parts.at(-1)}`;
}

/** "https://www.Example.com/path" → "example.com". */
export const domainOf = (input: string) => input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
export const isDomain = (domain: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);

/** How a site entry reads: maintained lists get a name. */
export function siteName(site: string): string {
  const lists: Record<string, string> = { "list:invidious": "Invidious instances", "list:piped": "Piped instances" };
  return lists[site] ?? site;
}

export const LIST_COLORS = ["#e5609b", "#ff6b5b", "#ff8a3d", "#7d8cff", "#5bc8ff", "#9be36d", "#c3a6ff"];

/** The colour of the blocklist an app is on, matched by its name, or grey
 *  when it's on none (Distraction time and the blocked-app screen use it). */
export function blocklistColorOf(label: string, blocklists: Record<string, Blocklist>): string {
  const list = Object.values(blocklists).find((l) => l.apps.some((a) => a.label.toLowerCase() === label.toLowerCase()));
  return list?.color ?? "#9aa0a6";
}
