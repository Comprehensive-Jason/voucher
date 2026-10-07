import { invoke } from "@tauri-apps/api/core";

const out = document.querySelector<HTMLPreElement>("#out")!;
const show = (label: string, v: unknown) => { out.textContent = `${label}\n${JSON.stringify(v, null, 2)}`; };
const run = (label: string, cmd: string, args?: Record<string, unknown>) =>
  invoke(cmd, args).then((v) => show(label, v)).catch((e) => show(`${label} FAILED`, String(e)));

document.querySelector("#status")!.addEventListener("click", () => run("status", "dpm_status"));
document.querySelector("#suspend")!.addEventListener("click", () => run("suspend", "dpm_suspend", { pkg: "com.android.chrome", suspended: true }));
document.querySelector("#unsuspend")!.addEventListener("click", () => run("unsuspend", "dpm_suspend", { pkg: "com.android.chrome", suspended: false }));
document.querySelector("#msg")!.addEventListener("click", () => run("support message", "dpm_support_message"));
