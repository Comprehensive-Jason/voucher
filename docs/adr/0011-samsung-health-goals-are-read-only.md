# Samsung Health's goals are read, never set, here

Jason sets his sleep target and step goal in Samsung Health, and setting them again in Counterfoil means two values that drift. Samsung's Health Data SDK can read Samsung Health's goals (the sleep goal, step, active time, active calories, nutrition, and water intake goals) but not write them: every goal type is Aggregate only, read as the last value saved over a range of dates. Health Connect has no goal records at all. So Samsung Health stays where these goals are set, and the Ledger keeps a read-only copy that Counterfoil shows and counts.

- **An owner on every goal.** `GET /goals` lists each goal with its owner: `user` for the Daily goal and every goal set in Voucher, Counterfoil, or through the coach code, or `samsung_health`. An outside app's goals have ids like `samsung_health:bedtime`. `POST /goal` and `/goal/remove` refuse them (`Owned`), and refuse a goal of the user's own on a measure an outside app already sets (`MeasureOwned`), each with a message naming the app.
- **One reporter.** Voucher's Android app reads the goals and sends them with `POST /goals/external {device, source, goals: [{kind, target}], claim?}`, which replaces what was kept. As with calendars, only one device sends them: the first to send, until another sends `"claim": true`, which it does once when its switch is turned on. The coach code may not call it, and neither may Counterfoil.
- **Mapped to measures where there is one.** The sleep target is a bedtime and a wake-up time, so it becomes two goals, on `bedtime` and `wake`, each "by" that time, every Day. Steps, active time, active calories, and water have no measure on the Ledger yet: they're kept and listed with `tracked: false` and an empty measure, never counted, and shown as not tracked here. No measure is made up for them; when the Ledger gains one, a stored goal maps to it without the phone sending anything new.
- **Read on the phone, about hourly.** The Enforcer's loop reads them when the app opens and then about once an hour, and sends them only when they change.

## Considered Options

- Set goals in Counterfoil and write them to Samsung Health: impossible, since the SDK can't write goals.
- Derive a time-asleep goal from the sleep target's bedtime and wake-up: rejected, because the span from bedtime to wake-up is time in bed, not time asleep, and the SDK has no duration of its own.
- Let Counterfoil edit a copy: rejected, because the next read from Samsung Health would overwrite it.
- Every device reports and the Ledger merges: rejected for the same reason as calendars, two readings of one thing.

## Consequences

- **The SDK isn't in the repository.** Samsung's license calls the SDK confidential, proprietary, and not open source, allows installing it on the developer's own devices for developing and testing, and forbids redistributing it. So the AAR goes in `app/libs/samsung-health/`, which git ignores, and Gradle compiles `src/samsung` against it only when it's there; otherwise `src/nosamsung`'s stub reports nothing available and the switch stays hidden. Every build works without it.
- **Developer mode.** Without Samsung's partner approval the SDK reads only while Samsung Health's developer mode is on, which Samsung says is for testing, not users. Fine for one person's own devices; a public build with the SDK would need Samsung's approval and its key signing first.
- **The switch shows only where it can work:** a Samsung device with Samsung Health, in a build with the SDK.
- Nothing about it runs on an emulator, which Samsung's SDK doesn't support, so it's verified only on a real device.
- Insights and hit rates treat a tracked outside goal like any other.
