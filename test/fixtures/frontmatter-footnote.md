---
title: Test Document
tags: [test, frontmatter, footnote]
date: 2026-05-03
---

# Frontmatter + Footnote Test

This paragraph references a footnote[^src]. The combination of YAML front matter
and footnotes previously crashed due to plugin registration order.

> [!NOTE]
> Alerts should also work alongside both features[^src].

## Section Two

More text with the same footnote ref[^src] and a different one[^other].

[^src]: [Source document](../sources/test.md) · [PDF](../files/test.pdf)
[^other]: Another footnote definition.
