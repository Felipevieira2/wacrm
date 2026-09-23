## 2024-05-18 - [PII Leak via Webhook Logging]
**Vulnerability:** Raw incoming webhook payloads containing user names, phone numbers, and message content were being logged to the console indiscriminately (`console.log(payload)`).
**Learning:** This exposes sensitive PII and potentially sensitive message contents to server logs, violating data privacy and least privilege logging principles.
**Prevention:** Avoid logging raw webhook payloads. Either remove them entirely, or log only safe, structural metadata (like event types or masked data) using structured logging libraries.
