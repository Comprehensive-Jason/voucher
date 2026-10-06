# Voucher

An app and website blocker in which free time is earned by verified productive work rather than granted on request. The name nods to the labour certificates of Marx's *Critique of the Gotha Programme*: proof of work done, cashed in later for an equal share.

## Language

### Authority and devices

**Ledger**:
The single authority that credits Vouchers, keeps the Bank, and signs Unlocks. There is exactly one.
_Avoid_: server, backend, verifier service

**Enforcer**:
A per-device program that blocks Distractions unless an Unlock is active. It can check an Unlock's signature but never create one.
_Avoid_: blocker, client, agent

### Earning

**Activity source**:
An external record of productive work that the Ledger reads, such as completed tasks, workouts, or Focused time in a chosen app.
_Avoid_: integration, verifier, provider

**Focused time**:
Time a chosen app spends in the foreground while the screen is on and the user is active. Time open in the background or on an idle screen does not count.
_Avoid_: screen time, usage, time open

**Earning rate**:
How many Vouchers one kind of activity is worth, such as one Voucher per completed task or per 30 minutes of Focused time.
_Avoid_: exchange rate, multiplier

**Voucher**:
One earned, unredeemed unit of free time, held in the Bank until Redeemed.
_Avoid_: token, credit, point

**Bank**:
The Vouchers currently held. They carry over from day to day.
_Avoid_: balance, wallet

**Bank limit**:
The most Vouchers the Bank can hold. Vouchers earned while the Bank is full are forfeited.
_Avoid_: cap, max balance

**Daily goal**:
The number of Vouchers to earn in one local day for that day to count toward the Streak. It motivates; it never changes access.
_Avoid_: target, quota

**Streak**:
The run of consecutive days, up to yesterday, on which the Daily goal was met.
_Avoid_: chain, combo

### Spending

**Redeem**:
To spend one Voucher from the Bank to open one Unlock.
_Avoid_: spend, cash in, use

**Unlock**:
A signed, fixed-length window during which Distractions are allowed. Only one Unlock is active at a time; when it ends, everything locks until the next Redemption.
_Avoid_: session, break, grant, token

**Unlock length**:
How many minutes one Unlock lasts.

**Pass**:
A short, signed window that opens one named Tool for a stated reason. It costs no Vouchers and never opens a Distraction.
_Avoid_: scoped pass, exception, override

### Targets

**Distraction**:
An app or site, such as social media or games, that is blocked unless an Unlock is active.
_Avoid_: blocked app, blacklist entry

**Tool**:
An app or site, such as system settings or admin pages, that is never blocked by default.
_Avoid_: whitelist entry, exception

### Commitment

**Tightening**:
A rule change that reduces access. It takes effect immediately.

**Loosening**:
A rule change that increases access, including pausing, moving the Curfew, raising an Earning rate, the Bank limit, or the Unlock length, and removing an Enforcer's protections. It never takes effect immediately.
_Avoid_: unlock, edit

**Morning boundary**:
The daily moment when every pending Loosening takes effect.
_Avoid_: cooldown, delay

**Curfew**:
The nightly window during which no Voucher can be Redeemed.
_Avoid_: bedtime block, sleep mode, downtime

**Gap**:
A stretch of time in which an Enforcer failed to check in with the Ledger, reported the next morning.
_Avoid_: outage, missed heartbeat

**Break-glass code**:
A single-use offline code that lifts all blocking when the Ledger is unreachable, and whose use is always reported.
_Avoid_: recovery code, master password
