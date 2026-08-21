## 2024-05-18 - Missing DB Transport Check causes Unit Test Failure in send-message
**Learning:** In the wacrm architecture, `sendMessageToConversation` explicitly intercepts the transport before testing database operations by querying `uazapi_config` first to check if the `uazapi` transport should handle the send. In unit tests mocking DB endpoints, the first called DB table must be `uazapi_config`, rather than `conversations`.
**Action:** When mocking Supabase database logic involving sending messages, always account for the `uazapi_config` check in assertion calls.
