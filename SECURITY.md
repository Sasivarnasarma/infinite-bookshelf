# Security policy

Infinite Bookshelf handles people's AI provider API keys, so security reports are taken seriously.
Thank you for helping keep its users safe.

## 📬 Reporting a vulnerability

> [!CAUTION]
> Please **don't open a public issue** for a security problem.

Use GitHub's
[private vulnerability reporting](https://github.com/Sasivarnasarma/infinite-bookshelf/security/advisories/new)
for this repository, and include:

- what the problem is, and where (file, endpoint or page);
- steps to reproduce it, ideally with a request or a book file;
- the impact: what an attacker could do;
- the version or commit you tested.

You'll get a reply as soon as possible. Once it's fixed, you'll be credited in the advisory and the
release notes, if you'd like.

## 🎯 Scope

Especially interesting:

- Ways API keys could be stored, logged, leaked in errors, or read by another website
- Ways to make a public server call private, loopback or link-local addresses (SSRF), getting round
  `IB_ALLOW_PRIVATE_ENDPOINTS=false`
- Script injection through model output (including maths), book imports, or the API docs page
- Ways a book's text could make the PDF renderer read files or reach other addresses
- Ways one user could affect another user's requests on a shared server

Not in scope:

- Behaviour that a setting deliberately allows, such as reaching private addresses with
  `IB_ALLOW_PRIVATE_ENDPOINTS=true` (the Docker Compose default for private servers)
- Denial of service through heavy use; servers can set a rate limit and size limit
- Problems that need someone else's browser or device to be compromised already

## 🔐 How users are protected

- **Keys** are kept only in the user's browser and sent with each request, where they're used for
  that request and never stored or logged.
- **Books** never leave the browser except as part of a request.
- **The page** loads no third-party code, under a strict Content Security Policy.

The [architecture guide](docs/architecture.md#-security-model) lists every protection in detail, and
[Running a public instance](docs/self-hosting.md#-running-a-public-instance) explains how to set up a
shared server safely.

## 📦 Supported versions

Security fixes go into the latest release and the `main` branch. Please update to the latest
version before reporting.
