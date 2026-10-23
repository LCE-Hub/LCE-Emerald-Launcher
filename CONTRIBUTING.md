# Contributing to LCE Emerald Launcher

Thank you for considering contributing to Emerald! We appreciate all types of contributions, including bug fixes, new features, and documentation improvements.

Before you start contributing, please take a moment to review the guidelines outlined here. This ensures a smooth collaboration and helps maintain the project's quality.

## Note
This file is a modified copy of the [4JCraft CONTRIBUTING.md](https://github.com/4jcraft/4jcraft/blob/dev/CONTRIBUTING.md) file. I felt the need to credit them lol

## How to Contribute

There are several ways you can contribute:

- **Report Bugs:** If you find a bug, please open an issue to describe the problem.
- **Feature Requests:** If you have an idea for a new feature, feel free to suggest it by opening an issue.
- **Submit Code:** If you want to contribute code, fork the repository, create a new branch, and submit a pull request.

Make sure to follow the guidelines below when submitting code or issues.

## Submitting code

If you are submitting a pull request to this repository, here are some guidelines to keep in mind.

### Test your changes.

Please run the game and make sure your code runs as expected before marking a pull request ready for review.

### Keep scope to a minimum.

Pull requests should ideally do one thing in one place. Avoiding opening massive pull requests that change multiple components of the launcher. These are often not reviewable and result in unmanageable conflicts with other active PRs.

### Use common sense with commits.

Commit names should clearly describe what was changed in the commit. [Conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) are generally appreciated, but by no means required. Similar to pull requests, commits should ideally be limited in scope and easy to track over time.

### Try to fix the cause, not the effect.

If you are fixing a bug, avoid submitting "hacks" that attempt to patch the effects of the bug rather than the root cause.

> Exceptions to this rule may apply depending on the severity of the bug, provided that the code is clearly commented as a hack with a relevant `// <your-username>:` comment.

### Don't submit code written by AI.

Submitting code to this repository authored by generative AI tools (LLMs, agentic coding tools, etc...) is strictly forbidden. Pull requests that are clearly vibe-coded or written by an LLM will be closed.

> **Rationale:** Contributors are expected to both fully understand the code that they write **and** have the necessary skills to *maintain it*. Opening PRs containing code that you did not write yourself more often than not fails to meet either of these expectations, therefore it is disallowed.
