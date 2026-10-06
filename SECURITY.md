# Security policy

Infinite Bookshelf handles users' AI provider API keys, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Instead, use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, with steps to reproduce and the impact. You'll get a response as soon as
possible, and credit in the fix if you'd like.

## Scope

Especially interesting:

- Ways API keys could be stored, logged, leaked in errors, or read by another origin
- Bypasses of the private-address (SSRF) protection on public instances
- Script injection through model output (including maths), book imports, or PDF export
- Ways a book's text could make the PDF renderer read files or reach other addresses
- Ways one user could affect another user's requests on a shared instance

## How keys are handled

Keys are stored only in the user's browser and sent to the server with each request, where they
are used for that request and never stored or logged. See
[docs/architecture.md](docs/architecture.md#security-notes) for the full list of protections.
