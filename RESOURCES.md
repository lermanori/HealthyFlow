# HealthyFlow Talk context resources

## Knowledge

- [Proposed Talk context architecture](docs/history/2026-10-19-talk-context-selection-architecture.md)
  The design being taught; use for the proposed turn sequence and evaluation plan.
- [Current Talk architecture](docs/architecture/talk.md)
  The shipped surface, Calendar snapshot, statuses, and conversation behavior.
- [ADR-0020: iPhone Calendar through EventKit](docs/adr/0020-iphone-calendar-is-read-directly-with-eventkit.md)
  Explains why the backend cannot fetch a missing iPhone Calendar date itself.
- [Adaptive-RAG (NAACL 2024)](https://aclanthology.org/2024.naacl-long.389/)
  Empirical support for choosing retrieval strategy based on the request.
- [SELF-multi-RAG (EMNLP Findings 2024)](https://aclanthology.org/2024.findings-emnlp.622/)
  Empirical support for resolving conversational references before retrieval.
- [Lost in the Middle (TACL 2024)](https://aclanthology.org/2024.tacl-1.9/)
  Why supplying a large, mostly irrelevant context can impair evidence use.
- [ToolRet (ACL Findings 2025)](https://aclanthology.org/2025.findings-acl.1258/)
  Why required-source recall must be tested when a router selects tools or data.

## Gaps

- No independent evaluation establishes Jev or another specific router's accuracy on HealthyFlow's Hebrew, multi-turn, structured Calendar requests. The proposed replay set must do that.
