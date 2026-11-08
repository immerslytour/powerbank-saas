# Hardware integration (HeyCharge / Shenzhen EMCC)

## What was ordered

Alibaba order #318253907001024173 (Shenzhen EMCC Technology Co., Ltd. — "HeyCharge"): 4 × 8-slot stations with
screen + POS card reader, 32 × 5000 mAh power banks, SIM cards (station connectivity), and the HeyCharge software
("admin system, connect Stripe POS, station with your Stripe account", USD 36/year/station). Estimated delivery
2026-12-07.

**Important:** the stations ship already paired to HeyCharge's own cloud. This platform integrates with that cloud
through its API — we do not replace the station firmware. The station's built-in POS card reader is driven by the
HeyCharge system; the QR/web flow in this platform is an additional, parallel way for customers to rent.

## What is already built

* `src/lib/hardware/types.ts` — the `HardwareProvider` contract:
  `authenticate, getDeviceStatus, getDeviceDetails, getBatteryInventory, unlockBattery, getRentalStatus,
  getReturnStatus, getDeviceEvents, getTransactionDetails, parseWebhook`.
* `src/lib/hardware/simulator.ts` — complete simulator (inventory, online/offline, slow/async unlocks, forced
  failures, returns). Everything it produces is flagged `is_simulated`.
* `src/lib/hardware/heycharge.ts` — **intentionally not implemented**: every method throws
  `ProviderNotConfiguredError`. No endpoints were invented. Machines registered with provider `heycharge`
  refuse to release batteries (the customer's card hold is released automatically) until this adapter is done.
* `POST /api/hardware/heycharge/webhook` — inbound callbacks; the adapter's `parseWebhook` verifies the signature
  and normalizes events (`battery_released`, `battery_returned`, `unlock_failed`, `connection_changed`,
  `device_error`). Events are deduplicated by `externalId`.
* Rental engine guarantees: a rental is **active only after a confirmed release** and **returned only after a
  confirmed return**. Unlocks are retried up to 3 times; pending unlocks are reconciled by the cron.

## Ask the supplier for (copy/paste)

> Hello, we received the HeyCharge stations. To integrate them with our own platform we need the **developer
> API documentation** for the HeyCharge admin system:
> 1. API base URL (sandbox + production) and authentication method (API key / OAuth / signed requests) and credentials for our account.
> 2. Endpoint to **eject/unlock a power bank** for a given station (and slot, if supported), its response, and how release is **confirmed** (sync response vs callback).
> 3. Endpoints for **station status** (online/offline, last heartbeat), **slot inventory** (battery serial, charge %, slot) and **station details** (model, firmware, SIM ICCID).
> 4. **Webhook/callback** configuration for: battery released, battery returned (with station ID, slot, battery serial), eject failure, station online/offline, errors. Payload examples and the **signature/verification scheme**.
> 5. How to query a **rental/order** by ID and a **battery's return status**.
> 6. Whether rentals started through the API must also be paid through HeyCharge, or whether we can charge the customer through our own Stripe account and only command the hardware.
> 7. Rate limits, idempotency keys, and error codes.

## Implementing the adapter (once docs arrive)

1. Store credentials per operator in `integrations` (`kind='hardware'`, `provider='heycharge'`) using
   `encryptJson()` (AES-256-GCM, key `APP_ENCRYPTION_KEY`). They are never selectable from the browser.
2. Implement each method in `heycharge.ts` against the real docs; return `confirmed` from `unlockBattery` **only** when
   the API confirms the battery left the slot, otherwise `pending` (and let the webhook confirm) or `failed`.
3. Implement `parseWebhook` with the supplier's signature verification; map payloads to `NormalizedDeviceEvent`.
   Use the station's ID as `deviceId` and a stable event ID as `externalId`.
4. Set `isReady = true` once `authenticate()` succeeds against a real station.
5. Register each station: **Machines → Add machine → HeyCharge**, Device ID = the station ID printed on the unit /
   shown in the HeyCharge admin. Print the QR from the machine page.
6. Point the supplier's callback URL to `https://<your-domain>/api/hardware/heycharge/webhook`.
7. Test with one station in Stripe **test mode**: rent → confirm release → return → confirm capture.
