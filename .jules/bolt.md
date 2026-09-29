## 2024-05-19 - Unnecessary Re-renders in Conversation List
**Learning:** React elements passed with translation functions like `useTranslations('Inbox.conversationList')` break `React.memo` unless omitted. `ConversationItem` was receiving `t`, causing the entire list to re-render.
**Action:** When using `React.memo` on components that receive a Next-Intl translation function `t`, always provide a custom equality function that explicitly omits `t` from the comparison.
