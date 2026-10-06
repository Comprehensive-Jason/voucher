# Voucher

An app and website blocker in which unlocked time is earned by verified productive work rather than granted on request. The name nods to the labour certificates of Marx's *Critique of the Gotha Programme*: proof of work done, redeemed for an equal share.

## Language

### Authority and devices

**Ledger**:
The single authority that tracks Earnings, holds the signing key, and issues Vouchers. There is exactly one.
_Avoid_: server, backend, verifier service

**Enforcer**:
A per-device program that blocks Distractions unless it holds a valid Voucher. It can check Vouchers but never create them.
_Avoid_: blocker, client, agent

**Voucher**:
A short-lived, signed grant of unlocked time for Distractions, issued by the Ledger from the Balance.
_Avoid_: token, unlock token, grant

**Pass**:
A short, signed grant that opens one named Tool for a stated reason. It is not paid for from the Balance and never opens a Distraction.
_Avoid_: scoped pass, exception, override

### Earning

**Activity source**:
An external record of productive work that the Ledger reads, such as completed tasks, reading, notes, or exercise.
_Avoid_: integration, verifier, provider

**Earning**:
Minutes credited to the Balance for one piece of verified activity.
_Avoid_: reward, credit

**Balance**:
Earned minutes not yet spent on Vouchers.
_Avoid_: allowance, credit, wallet

**Rate**:
How much of one kind of activity converts to how many minutes of Earning.
_Avoid_: exchange rate, multiplier

**Daily cap**:
The most minutes that can be spent on Vouchers in one day, whatever the Balance.

### Targets

**Distraction**:
An app or site that is blocked unless a Voucher is active.
_Avoid_: blocked app, blacklist entry

**Tool**:
An app or site that is never blocked by default, such as system settings or admin pages, and that only a Pass can open if it ever is blocked.
_Avoid_: whitelist entry, exception

### Commitment

**Tightening**:
A rule change that reduces access. It takes effect immediately.

**Loosening**:
A rule change that increases access, including pausing, removing a schedule, raising a cap, or removing an Enforcer's protections. It never takes effect immediately.
_Avoid_: unlock, edit

**Morning boundary**:
The daily moment when every pending Loosening takes effect.
_Avoid_: cooldown, delay

**Curfew**:
The nightly window during which the Ledger issues no Vouchers, regardless of Balance.
_Avoid_: bedtime block, sleep mode, downtime

**Gap**:
A stretch of time in which an Enforcer failed to check in with the Ledger, reported the next morning.
_Avoid_: outage, missed heartbeat

**Break-glass code**:
A single-use offline code that lifts all blocking when the Ledger is unreachable, and whose use is always reported.
_Avoid_: recovery code, master password
