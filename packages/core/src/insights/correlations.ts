// What goes with what, as Insights: every finding the Good Day comparison
// shows ($core/goodDays.ts and correlate.ts, worked out in the worker), said
// as "Day after Workout: Chinese Vouchers", with its ratio dumbbell.
import type { Run } from "../about";
import { STRETCH, type Tested } from "../correlate";
import { better, change, DISTRACTED, driverWords, GOOD_NIGHT, LATE, SLEEP, type GoodDaySetup } from "../goodDays";
import { hoursAndMinutes } from "../time";
import { clamp } from "./context";
import { correlation } from "./text";
import type { Finding } from "./types";

/** How a driver reads, with a source's name in its own color. */
function driverRuns(f: Tested, setup: GoodDaySetup): Run[] {
  const d = setup.doerOf.get(f.driver)!;
  if (f.driver === GOOD_NIGHT && Number.isFinite(setup.goodNight)) return [{ text: `Days after ${hoursAndMinutes(setup.goodNight)} or more asleep` }];
  if (f.driver === LATE) return [{ text: "Nights after late Distraction" }];
  const words = driverWords(f, d);
  const isSource = !f.driver.startsWith("~");
  const short = isSource ? words.match(/^(?:Day after |Night after )?(.*?)(?: Days)?$/)?.[1] : undefined;
  if (!short || !isSource) return [{ text: words }];
  const i = words.indexOf(short);
  return [...(i ? [{ text: words.slice(0, i) }] : []), { text: short, color: d.color }, ...(words.slice(i + short.length) ? [{ text: words.slice(i + short.length) }] : [])];
}

/** How an outcome reads: "Chinese Vouchers", "longest focus stretch". */
function outcomeRuns(f: Tested, setup: GoodDaySetup): Run[] {
  const o = setup.measureOf.get(f.outcome)!;
  if (o.unit === "vouchers") return [{ text: o.name, color: o.color }, { text: " Vouchers" }];
  const words: Record<string, string> = {
    "~gavein": "giving in to blocked apps", "~longest": "longest focus stretch", [DISTRACTED]: "Distraction",
    [SLEEP]: "time asleep", [STRETCH]: "focus stretch length",
  };
  return [{ text: words[f.outcome] ?? o.name.toLowerCase() }];
}

export function correlationFindings(tested: Tested[], setup: GoodDaySetup): Finding[] {
  return tested.filter((f) => f.shown && setup.measureOf.has(f.outcome) && setup.doerOf.has(f.driver)).map((f): Finding => {
    const o = setup.measureOf.get(f.outcome)!, d = setup.doerOf.get(f.driver)!;
    const good = better(f, o), noun = f.per === "stretch" ? "stretches" : "Days";
    const show = (v: number) => (o.unit === "vouchers" ? v.toFixed(1) : `${Math.round(v)}${o.unit === "percent" ? "%" : " min"}`);
    return {
      id: `cor:${f.driver}|${f.outcome}|${f.lag}`,
      kind: "correlation",
      domain: o.unit === "vouchers" ? "earning" : f.outcome === SLEEP ? "sleep" : f.outcome === DISTRACTED ? "distraction" : "focus",
      subject: f.driver.startsWith("~") ? undefined : { id: f.driver, color: d.color },
      sentence: correlation(driverRuns(f, setup), outcomeRuns(f, setup)),
      size: clamp(f.effect * 2, 0, 3),
      confidence: f.confidence as 1 | 2 | 3,
      pill: { text: change(f, o.unit), tone: good ? "good" : "worse" },
      visual: { kind: "dumbbell", without: f.withoutAvg, with: f.withAvg, color: d.color, good },
      proof: {
        facts: [[`${noun[0].toUpperCase()}${noun.slice(1)} without`, `${f.withoutN}, ${show(f.withoutAvg)} on average`], [`${noun[0].toUpperCase()}${noun.slice(1)} with`, `${f.withN}, ${show(f.withAvg)} on average`]],
        note: "The bars say how sure: shuffling whole weeks of your Days thousands of times rarely gives a difference this big. These go together; that doesn't prove one causes the other.",
        tested: { ...f, unit: o.unit, up: o.up, color: d.color, outcome: o.name },
      },
      value: f.withAvg - f.withoutAvg,
      floor: Math.max(0.5, f.spread * 0.3),
    };
  });
}
